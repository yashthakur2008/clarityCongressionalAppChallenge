#!/usr/bin/env python3
"""Launch a RunPod floor-segmentation training pod. Requires RUNPOD_API_KEY.

This script performs NO cloud mutation unless you pass `--create`. The default
mode is a read-only preflight that proves the credential works and prints live
GPU prices, so cost is quoted from the provider rather than guessed.

    export RUNPOD_API_KEY=...            # not present on this machine today
    python3 training/launch_floor_run.py                 # preflight only
    python3 training/launch_floor_run.py --create --confirm-spend-usd 6

Honest status: as of 2026-10-26 no RUNPOD_API_KEY exists on this machine and the
previously used pod jgmvyjlozpj1pl is EXITED with no persistent volume, so this
script has NOT been run in `--create` mode. Preflight has not been run either,
because there is no credential to run it with. See FLOOR_SEGMENTATION.md.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

API = 'https://api.runpod.io/graphql'
# Candidates in rough order of cost. Actual availability and price come from the
# API at runtime; nothing here is a quoted price.
PREFERRED_GPUS = [
    'NVIDIA GeForce RTX 4090',
    'NVIDIA RTX A5000',
    'NVIDIA GeForce RTX 3090',
    'NVIDIA RTX A4000',
]
IMAGE = 'runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04'

MYSELF = 'query { myself { id currentSpendPerHr } }'
GPU_TYPES = '''query {
  gpuTypes {
    id
    displayName
    memoryInGb
    secureCloudPrice: securePrice
    communityCloudPrice: communityPrice
    lowestPrice(input: {gpuCount: 1}) { minimumBidPrice uninterruptablePrice }
  }
}'''


def api(query: str, key: str, timeout: int = 20) -> dict:
    """POST a GraphQL query. The key travels in the URL per provider docs.

    Exception text is never surfaced verbatim because provider HTTP errors can
    echo the credential-bearing URL.
    """
    url = API + '?api_key=' + urllib.parse.quote(key, safe='')
    request = urllib.request.Request(
        url, json.dumps({'query': query}).encode(), {'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read(1 << 20))
    except Exception:
        raise RuntimeError('RUNPOD_API_REQUEST_FAILED') from None
    if payload.get('errors'):
        raise RuntimeError('RUNPOD_API_REJECTED_QUERY')
    return payload['data']


def bootstrap(epochs: int, subset: int) -> str:
    """Pod startup command. Self-contained, unattended, logs to /workspace."""
    return (
        'set -euo pipefail; '
        'mkdir -p /workspace/floorseg && cd /workspace/floorseg; '
        'pip install -q "transformers==4.44.2" "datasets==2.21.0" '
        '"evaluate==0.4.3" "albumentations==1.4.15" onnx onnxruntime; '
        f'FLOOR_EPOCHS={epochs} FLOOR_SUBSET={subset} '
        'nohup python3 /workspace/floorseg/train_floor_seg.py '
        '> /workspace/floorseg/train.log 2>&1 & '
        'echo $! > /workspace/floorseg/train.pid; wait'
    )


def create_mutation(gpu_id: str, args) -> str:
    command = bootstrap(args.epochs, args.subset).replace('\\', '\\\\').replace('"', '\\"')
    return (
        'mutation { podFindAndDeployOnDemand(input: {'
        f'cloudType: {args.cloud}, gpuCount: 1, '
        f'volumeInGb: {args.volume_gb}, containerDiskInGb: 40, '
        'volumeMountPath: "/workspace", '
        f'minVcpuCount: 4, minMemoryInGb: 16, '
        f'gpuTypeId: "{gpu_id}", name: "clarity-floorseg", '
        f'imageName: "{IMAGE}", '
        f'dockerArgs: "bash -lc \\"{command}\\"", '
        'ports: "22/tcp"'
        '}) { id imageName machineId costPerHr desiredStatus } }'
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--create', action='store_true',
                        help='actually create a pod and start billing')
    parser.add_argument('--confirm-spend-usd', type=float, default=0.0,
                        help='required with --create: your authorized ceiling in USD')
    parser.add_argument('--max-hourly-usd', type=float, default=0.90,
                        help='refuse any GPU priced above this per hour')
    parser.add_argument('--epochs', type=int, default=8)
    parser.add_argument('--subset', type=int, default=4000,
                        help='ADE20K training images to use for the first run')
    parser.add_argument('--volume-gb', type=int, default=40,
                        help='persistent volume; keeps weights across a stop')
    parser.add_argument('--cloud', choices=['SECURE', 'COMMUNITY'], default='COMMUNITY')
    args = parser.parse_args()

    key = os.environ.get('RUNPOD_API_KEY', '').strip()
    if not key:
        print('BLOCKED: RUNPOD_API_KEY is not set. Nothing was launched.', file=sys.stderr)
        print('Set it and re-run preflight first (no --create).', file=sys.stderr)
        return 2

    identity = api(MYSELF, key)['myself']
    print(f"credential OK, account {identity['id']}, "
          f"current spend/hr ${identity.get('currentSpendPerHr') or 0:.3f}")

    offers = []
    for gpu in api(GPU_TYPES, key)['gpuTypes']:
        price = (gpu.get('lowestPrice') or {}).get('uninterruptablePrice')
        if price:
            offers.append((float(price), gpu['id'], gpu['displayName'], gpu['memoryInGb']))
    offers.sort()

    print('\ncheapest available on-demand GPUs (live provider prices):')
    for price, _, name, mem in offers[:8]:
        print(f'  ${price:>5.3f}/hr  {mem:>3}GB  {name}')

    ranked = sorted(
        (o for o in offers if o[2] in PREFERRED_GPUS and o[0] <= args.max_hourly_usd),
        key=lambda o: o[0],
    )
    if not ranked:
        ranked = [o for o in offers if o[0] <= args.max_hourly_usd][:1]
    if not ranked:
        print(f'\nNo GPU at or below ${args.max_hourly_usd}/hr. Nothing launched.',
              file=sys.stderr)
        return 3

    price, gpu_id, name, _ = ranked[0]
    # 8 epochs over 4k ADE20K images with segformer-b0 at 512px is roughly
    # 2-3 hours on a 4090-class card. Budget 4 hours to be safe.
    hours = 4.0
    estimate = price * hours
    print(f'\nselected: {name} at ${price:.3f}/hr')
    print(f'estimate: ~{hours:.0f}h wall clock for {args.epochs} epochs on '
          f'{args.subset} images  =>  ~${estimate:.2f}')
    print('This is an estimate from the live hourly rate, not an invoice. '
          'Throughput was not measured on this GPU.')

    if not args.create:
        print('\nPREFLIGHT ONLY. No pod created, no billing started.')
        print('Re-run with --create --confirm-spend-usd <ceiling> to launch.')
        return 0

    if args.confirm_spend_usd < estimate:
        print(f'\nREFUSED: estimate ${estimate:.2f} exceeds your confirmed ceiling '
              f'${args.confirm_spend_usd:.2f}.', file=sys.stderr)
        return 4
    if args.volume_gb < 10:
        print('REFUSED: a persistent volume is required or the weights die on stop.',
              file=sys.stderr)
        return 5

    pod = api(create_mutation(gpu_id, args), key)['podFindAndDeployOnDemand']
    print('\nPOD CREATED, BILLING HAS STARTED:')
    print(json.dumps(pod, indent=2))
    print('\nNext, required:')
    print('  1. scp training/train_floor_seg.py to /workspace/floorseg/ on the pod')
    print('  2. arm a budget guard for this pod id before leaving it unattended')
    print('  3. record the pod id in training/FLOOR_SEGMENTATION.md')
    return 0


if __name__ == '__main__':
    sys.exit(main())
