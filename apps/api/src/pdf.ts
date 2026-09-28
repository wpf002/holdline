import { extractText, getDocumentProxy } from "unpdf";

/**
 * PDF -> text, so core can parse bid packages without a PDF reader in it.
 *
 * Bid packages print two columns per page. The extracted text runs them together in reading
 * order, which is why the FOS parser puts a pairing block back together from its own markers
 * rather than from column positions.
 */
export class PdfError extends Error {}

export async function pdfText(base64: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(base64, "base64"));
  } catch {
    throw new PdfError("That file didn't arrive as base64.");
  }
  if (bytes.byteLength < 5 || Buffer.from(bytes.subarray(0, 4)).toString() !== "%PDF") {
    throw new PdfError("That file isn't a PDF.");
  }
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (err) {
    throw new PdfError(err instanceof Error ? err.message : "The PDF couldn't be read.");
  }
}
