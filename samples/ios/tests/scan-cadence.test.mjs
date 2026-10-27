import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('MyEyes/ScanModel.swift', root), 'utf8');

test('actual Swift cadence caps fast inference at 10fps without slowing slow inference or retries', () => {
  const scratch = mkdtempSync(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'scan-cadence-'));
  try {
    const binary = join(scratch, 'cadence');
    execFileSync('swiftc', ['-parse-as-library', fileURLToPath(new URL('MyEyes/ScanCadence.swift', root)), fileURLToPath(new URL('tests/ScanCadenceTests.swift', root)), '-o', binary], { timeout: 60000 });
    assert.match(execFileSync(binary, { encoding: 'utf8', timeout: 10000 }), /PASS 100ms cadence cap/);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('scan uses tested cadence inside existing single-flight cancellation and recovery loop', () => {
  const analyze = source.slice(source.indexOf('private func analyze('), source.indexOf('private func startFrameWatchdog('));
  assert.match(analyze, /guard phase == \.scanning, !cameraPaused, generation == current, frameTask == nil else/);
  assert.match(analyze, /let delay = ScanCadence\.delay\(elapsed: ProcessInfo\.processInfo\.systemUptime - frame\.capturedAt, retryDelay: retryDelay\)/);
  assert.doesNotMatch(analyze, /1\.0 \/ 3/);
  assert.match(analyze, /retryDelay = 1/);
  assert.match(analyze, /guard await reloadDetector\(generation: current\)/);
  assert.match(analyze, /try await Task\.sleep[\s\S]*?catch \{ return \}[\s\S]*?guard generation == current, phase == \.scanning, !Task\.isCancelled else \{ return \}\s*frameTask = nil\s*camera\.requestFrame\(\)\s*startFrameWatchdog/);
  assert.match(source, /frameTask\?\.cancel\(\)/);
});

test('sampled inference diagnostics include only numeric metadata, never labels or frames', () => {
  const match = source.match(/if checkedFrames == 1 \|\| checkedFrames % 30 == 0 \{\s*PiPDiagnostics\.log\("scan\.inference", "([^\n]+)"\)/);
  assert.ok(match, 'retain first and every 30 completed frames sampling');
  assert.equal(match[1], 'checked=\\(checkedFrames) processingMs=\\(result.processingMs) ageMs=\\(Int(age * 1000)) confidenceThreshold=\\(preferences.confidenceThreshold) detectionCount=\\(result.detections.count) inZoneCount=\\(result.detections.filter { $0.inZone }.count)');
});

test('cadence helper is included in the iOS target', () => {
  const project = readFileSync(new URL('MyEyes.xcodeproj/project.pbxproj', root), 'utf8');
  assert.equal((project.match(/ScanCadence.swift in Sources/g) || []).length, 2);
  assert.match(project, /path = ScanCadence.swift/);
});
