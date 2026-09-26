/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />


declare module "*.txt?raw" {
  const content: string;
  export default content;
}