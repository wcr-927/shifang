/** Hash routes belong to one document; ports, paths, queries and origin changes do not. */
export function isTrustedDocument(value:string,documentUrl:string):boolean {
  try {const actual=new URL(value),expected=new URL(documentUrl);actual.hash="";expected.hash="";return actual.href===expected.href;}catch{return false;}
}
export const productionCsp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
// Vite's React refresh preamble requires inline scripts in development only.
// No eval, remote hosts or wildcard ports; HMR is restricted to the loopback Vite port.
export const developmentCsp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
