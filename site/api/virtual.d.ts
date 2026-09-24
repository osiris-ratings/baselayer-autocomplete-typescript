declare module "virtual:api-reference" {
  export const document: import("./spec/assemble").OpenApiDocument;
  export const html: Record<string, string>;
}
