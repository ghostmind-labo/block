// Types of "@ghostmind-dev/block/catalogue", written by hand (see index.d.ts).
export interface CatalogueEntry {
  pkg: string;
  global: string;
  category: string;
  summary: string;
  when: string;
  builds: string[];
  module?: boolean;
  styles?: string[];
  sandbox?: string[];
  tested?: string;
  [more: string]: unknown;
}
declare const catalogue: Record<string, CatalogueEntry>;
export default catalogue;
