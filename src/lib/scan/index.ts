// Client scan pipeline (PLAN «Клиентский конвейер»). DevScanPage is not exported here: import it from './DevScanPage'.
export { ScanError, isScanError, isAbortError, MESSAGES as SCAN_MESSAGES, type ScanErrorCode } from './errors';
export { prepareImage, centerLuminance, fitSize, MAX_SIDE, MAX_UPLOAD_BYTES, type PreparedImage, type ImageCodec, type DecodedPhoto } from './prepare';
export {
  runAnalysis,
  resumeAnalysis,
  runSimulation,
  resumeSimulation,
  runAging,
  resumeAging,
  hasIntensity,
  type ScanStep,
  type AnalysisOutcome,
  type AgingOutcome,
  type RunOptions,
} from './pipeline';
export { maskStats } from './maskStats';
export { maskStatsFromAlpha, countBlemishes, rednessAreaPct, findMarks, alphaOf, type MarkCount, type MaskComponent } from './mask-core';
export { useScan, SCAN_STEPS, type UseScan, type ScanStatus, type UseScanRunOptions } from './useScan';
