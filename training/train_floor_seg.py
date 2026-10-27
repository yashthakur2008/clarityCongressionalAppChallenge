#!/usr/bin/env python3
"""Binary floor-vs-not segmentation on ADE20K, exported to ONNX for iOS.

Purpose: produce a floor mask so that an object standing on the floor can be
proposed as an obstacle even when it is none of the 80 COCO classes. Obstacles
are the not-floor connected components that touch the floor region, which is
the image-space analogue of the LiDAR geometry in `ground_plane.py`. This
composes with the existing detector; it does not replace it.

Why ADE20K and not COCO-Stuff: ADE20K's scene-parsing release ships dense masks
with an explicit `floor` class plus related ground surfaces, and loads
unattended through `datasets`. COCO-Stuff needs a separate 1.1GB
stuff-annotation download and a label remap. The floor label id is resolved
from the dataset's own metadata at runtime, never hardcoded, because a guessed
index is how this kind of script silently trains on the wrong class.

Honest status: this script has NEVER been run. No GPU, no RunPod credential and
no downloaded dataset exist on the machine that authored it. Treat every number
below as a configuration choice, not a measurement. Nothing here establishes
that a trained model would improve obstacle detection.

Unattended run on a pod:

    FLOOR_EPOCHS=8 FLOOR_SUBSET=4000 python3 train_floor_seg.py

Outputs under `--out` (default /workspace/floorseg/artifacts):
  best.pt            best checkpoint by validation floor IoU
  metrics.json       per-epoch validation floor IoU / pixel accuracy
  floor_seg.onnx     static 1x3x512x512 export of the best checkpoint
  onnx_parity.json   max abs logit difference, torch vs onnxruntime
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import time

# Index of `floor` in the ADE20K SceneParse150 label set. The HuggingFace
# `scene_parse_150` loader emits 0 for "other/unlabelled" and 1..150 for the
# classes, so `floor` lands on 4 there. Both constants are asserted at runtime
# against the dataset's own feature names rather than trusted blindly.
ADE_FLOOR_NAMES = ('floor', 'floor;flooring')
EXTRA_GROUND_NAMES = ('road;route', 'earth;ground', 'path', 'sidewalk;pavement',
                      'rug;carpet;carpeting', 'land;ground;soil')


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='/workspace/floorseg/artifacts')
    parser.add_argument('--epochs', type=int, default=int(os.environ.get('FLOOR_EPOCHS', 8)))
    parser.add_argument('--subset', type=int, default=int(os.environ.get('FLOOR_SUBSET', 4000)),
                        help='training images; 0 means the full split')
    parser.add_argument('--val-subset', type=int, default=500)
    parser.add_argument('--batch', type=int, default=8)
    parser.add_argument('--size', type=int, default=512)
    parser.add_argument('--lr', type=float, default=6e-5)
    parser.add_argument('--seed', type=int, default=20261026)
    parser.add_argument('--model', default='nvidia/mit-b0',
                        help='segformer-b0 encoder; ~3.7M params, mobile-friendly')
    parser.add_argument('--max-hours', type=float, default=4.0,
                        help='hard wall-clock cap; the run stops at a clean epoch')
    parser.add_argument('--include-ground', action='store_true',
                        help='also treat road/earth/sidewalk/rug as walkable floor')
    return parser.parse_args()


def resolve_floor_ids(label_names, include_ground: bool) -> set[int]:
    """Map label names to ids from the dataset's own metadata.

    Hardcoding index 3 or 4 is how this kind of script silently trains on the
    wrong class, so the ids are derived and then asserted non-empty.
    """
    wanted = set(ADE_FLOOR_NAMES)
    if include_ground:
        wanted |= set(EXTRA_GROUND_NAMES)
    ids = {i for i, name in enumerate(label_names) if name.strip().lower() in wanted}
    if not ids:
        raise SystemExit(
            'FLOOR_CLASS_NOT_FOUND: dataset label names did not contain a floor class. '
            'Print the label list and fix the mapping instead of guessing an index.'
        )
    return ids


def main():
    args = parse_args()
    import numpy as np
    import torch
    from torch.utils.data import DataLoader, Dataset
    from datasets import load_dataset
    from transformers import SegformerForSemanticSegmentation

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    if device == 'cpu':
        print('WARNING: no CUDA device. This will be far too slow to be useful.')

    raw = load_dataset('scene_parse_150', trust_remote_code=True)
    label_feature = raw['train'].features['scene_category']
    # The mask label names live in the dataset card, not in the features, for
    # scene_parse_150. Pull them from the annotation feature when present and
    # otherwise fail loudly rather than assuming an index.
    names = getattr(getattr(raw['train'].features.get('annotation'), 'feature', None),
                    'names', None) or getattr(label_feature, 'names', None)
    if names is None:
        raise SystemExit(
            'LABEL_NAMES_UNAVAILABLE: resolve the ADE20K floor id explicitly before '
            'training. Do not fall back to a guessed constant.'
        )
    floor_ids = resolve_floor_ids(names, args.include_ground)
    print(f'floor label ids resolved from dataset metadata: {sorted(floor_ids)}')

    train_split = raw['train'].shuffle(seed=args.seed)
    if args.subset:
        train_split = train_split.select(range(min(args.subset, len(train_split))))
    val_split = raw['validation'].select(range(min(args.val_subset, len(raw['validation']))))

    class FloorSet(Dataset):
        def __init__(self, split, train: bool):
            self.split = split
            self.train = train

        def __len__(self):
            return len(self.split)

        def __getitem__(self, index):
            import cv2
            record = self.split[index]
            image = np.array(record['image'].convert('RGB'))
            mask = np.array(record['annotation'])
            image = cv2.resize(image, (args.size, args.size), interpolation=cv2.INTER_LINEAR)
            mask = cv2.resize(mask, (args.size, args.size), interpolation=cv2.INTER_NEAREST)
            binary = np.isin(mask, list(floor_ids)).astype(np.int64)
            if self.train and np.random.rand() < 0.5:
                image, binary = image[:, ::-1].copy(), binary[:, ::-1].copy()
            tensor = torch.from_numpy(image).permute(2, 0, 1).float() / 255.0
            tensor = (tensor - torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)) \
                / torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
            return tensor, torch.from_numpy(binary)

    train_loader = DataLoader(FloorSet(train_split, True), batch_size=args.batch,
                              shuffle=True, num_workers=4, drop_last=True)
    val_loader = DataLoader(FloorSet(val_split, False), batch_size=args.batch,
                            shuffle=False, num_workers=2)

    model = SegformerForSemanticSegmentation.from_pretrained(
        args.model, num_labels=2, ignore_mismatched_sizes=True).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    scaler = torch.amp.GradScaler('cuda', enabled=device == 'cuda')

    def evaluate():
        model.eval()
        intersection = union = correct = total = 0
        with torch.no_grad():
            for images, masks in val_loader:
                images, masks = images.to(device), masks.to(device)
                logits = model(pixel_values=images).logits
                logits = torch.nn.functional.interpolate(
                    logits, size=masks.shape[-2:], mode='bilinear', align_corners=False)
                predicted = logits.argmax(1)
                intersection += int(((predicted == 1) & (masks == 1)).sum())
                union += int(((predicted == 1) | (masks == 1)).sum())
                correct += int((predicted == masks).sum())
                total += int(masks.numel())
        return {
            'floor_iou': (intersection / union) if union else 0.0,
            'pixel_accuracy': (correct / total) if total else 0.0,
        }

    deadline = time.time() + args.max_hours * 3600
    history, best_iou = [], -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        for images, masks in train_loader:
            images, masks = images.to(device), masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda', enabled=device == 'cuda'):
                loss = model(pixel_values=images, labels=masks).loss
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            running += float(loss)
        metrics = evaluate()
        metrics.update(epoch=epoch, train_loss=running / max(1, len(train_loader)))
        history.append(metrics)
        print(json.dumps(metrics), flush=True)
        if metrics['floor_iou'] > best_iou:
            best_iou = metrics['floor_iou']
            # Atomic: a truncated checkpoint is worse than no checkpoint.
            tmp = out / 'best.pt.tmp'
            torch.save({'state_dict': model.state_dict(), 'metrics': metrics,
                        'floor_ids': sorted(floor_ids), 'args': vars(args)}, tmp)
            tmp.replace(out / 'best.pt')
        (out / 'metrics.json').write_text(json.dumps(history, indent=2))
        if time.time() > deadline:
            print(f'WALL_CLOCK_CAP_REACHED after epoch {epoch}; stopping cleanly.')
            break

    if best_iou < 0:
        raise SystemExit('NO_EPOCH_COMPLETED: nothing to export.')

    model.load_state_dict(torch.load(out / 'best.pt', map_location=device)['state_dict'])
    model.eval()
    dummy = torch.randn(1, 3, args.size, args.size, device=device)
    onnx_path = out / 'floor_seg.onnx'
    torch.onnx.export(model, (dummy,), str(onnx_path), input_names=['pixel_values'],
                      output_names=['logits'], opset_version=17, do_constant_folding=True)

    import onnxruntime
    session = onnxruntime.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
    with torch.no_grad():
        reference = model(pixel_values=dummy).logits.cpu().numpy()
    produced = session.run(None, {'pixel_values': dummy.cpu().numpy()})[0]
    delta = float(abs(reference - produced).max())
    (out / 'onnx_parity.json').write_text(json.dumps({
        'max_abs_logit_delta': delta,
        'parity_ok': delta < 1e-3,
        'best_floor_iou': best_iou,
        'note': 'Parity is runtime agreement only. It says nothing about accuracy.',
    }, indent=2))
    print(f'done. best floor IoU {best_iou:.4f}, onnx max delta {delta:.2e}')


if __name__ == '__main__':
    main()
