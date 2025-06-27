declare module '@thombruce/fountain-js' {
  export interface FountainToken {
    type: string;
    text: string;
    [key: string]: any;
  }

  /* Returns { html: {...}, tokens?: FountainToken[] } */
  export function parse(
    text: string,
    withTokens?: boolean
  ): { tokens?: FountainToken[]; [key: string]: any };

  const fountain: { parse: typeof parse };
  export default fountain;
}
