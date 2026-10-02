/** Document-level JavaScript, kept outside the undo history (it is a build option). */
let documentJS = '';

export function getDocumentJS(): string {
  return documentJS;
}

export function setDocumentJS(script: string): void {
  documentJS = script;
}
