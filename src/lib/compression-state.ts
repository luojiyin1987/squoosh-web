import {
  DEFAULT_SETTINGS,
  type CompressionFormat,
  type CompressionSettings,
  type DecodedImage,
} from './codecs'

export interface CompressionResult {
  elapsedMs: number
  extension: string
  format: CompressionFormat
  inputBytes: number
  mimeType: string
  outputBytes: number
  previewUrl: string
  width: number
  height: number
}

export type CompressionPhase =
  | { tag: 'idle' }
  | { tag: 'ready' }
  | {
      tag: 'decoding'
      file: File
      requestId: number
      settings: CompressionSettings
      startedAt: number
    }
  | {
      tag: 'encoding'
      decoded: DecodedImage
      file: File
      requestId: number
      settings: CompressionSettings
      startedAt: number
    }
  | { tag: 'success'; result: CompressionResult }
  | { tag: 'error'; message: string }

export interface CompressionState {
  file: File | null
  nextRequestId: number
  phase: CompressionPhase
  settings: CompressionSettings
}

export type CompressionAction =
  | { type: 'selectFile'; file: File | null }
  | { type: 'updateSettings'; partial: Partial<CompressionSettings> }
  | { type: 'startCompression'; startedAt: number }
  | { type: 'decodeSuccess'; decoded: DecodedImage }
  | { type: 'decodeError'; message: string }
  | { type: 'encodeSuccess'; result: CompressionResult }
  | { type: 'encodeError'; message: string }

export const INITIAL_COMPRESSION_STATE: CompressionState = {
  file: null,
  nextRequestId: 1,
  phase: { tag: 'idle' },
  settings: { ...DEFAULT_SETTINGS },
}

function getReadyPhase(file: File | null): CompressionPhase {
  return file ? { tag: 'ready' } : { tag: 'idle' }
}

// This screen is modeled as a small state machine.
// requestId is used to ignore stale async results.
export function compressionReducer(
  state: CompressionState,
  action: CompressionAction,
): CompressionState {
  switch (action.type) {
    case 'selectFile':
      return {
        ...state,
        file: action.file,
        phase: getReadyPhase(action.file),
      }

    case 'updateSettings':
      return {
        ...state,
        phase: getReadyPhase(state.file),
        settings: {
          ...state.settings,
          ...action.partial,
        },
      }

    case 'startCompression': {
      if (!state.file) {
        return state
      }

      return {
        ...state,
        nextRequestId: state.nextRequestId + 1,
        phase: {
          tag: 'decoding',
          file: state.file,
          requestId: state.nextRequestId,
          settings: { ...state.settings },
          startedAt: action.startedAt,
        },
      }
    }

    case 'decodeSuccess': {
      if (state.phase.tag !== 'decoding') {
        return state
      }

      return {
        ...state,
        nextRequestId: state.nextRequestId + 1,
        phase: {
          tag: 'encoding',
          decoded: action.decoded,
          file: state.phase.file,
          requestId: state.nextRequestId,
          settings: state.phase.settings,
          startedAt: state.phase.startedAt,
        },
      }
    }

    case 'decodeError':
      if (state.phase.tag !== 'decoding') {
        return state
      }

      return {
        ...state,
        phase: {
          tag: 'error',
          message: action.message,
        },
      }

    case 'encodeSuccess':
      if (state.phase.tag !== 'encoding') {
        return state
      }

      return {
        ...state,
        phase: {
          tag: 'success',
          result: action.result,
        },
      }

    case 'encodeError':
      if (state.phase.tag !== 'encoding') {
        return state
      }

      return {
        ...state,
        phase: {
          tag: 'error',
          message: action.message,
        },
      }
  }
}

export function isCurrentRequestPhase(
  phase: CompressionPhase,
  expectedTag: 'decoding' | 'encoding',
  requestId: number,
): boolean {
  return phase.tag === expectedTag && phase.requestId === requestId
}
