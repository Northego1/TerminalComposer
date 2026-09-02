/**
 * The shipped command descriptions carry no types of their own.
 *
 * `unknown` is the honest shape: the walker checks what it needs as it goes,
 * and a richer type here would only be a guess about data we did not write.
 */
declare module "*.js" {
  const spec: unknown;
  export default spec;
}
