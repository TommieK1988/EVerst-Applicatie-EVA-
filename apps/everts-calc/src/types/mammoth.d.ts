declare module 'mammoth' {
  interface ConvertOptions {
    styleMap?: string[]
    includeDefaultStyleMap?: boolean
    convertImage?: unknown
    ignoreEmptyParagraphs?: boolean
  }

  interface ConvertResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }

  type InputBuffer = { buffer: Buffer | ArrayBuffer }
  type InputPath   = { path: string }
  type Input = InputBuffer | InputPath

  function convertToHtml(input: Input, options?: ConvertOptions): Promise<ConvertResult>
  function extractRawText(input: Input): Promise<ConvertResult>
}
