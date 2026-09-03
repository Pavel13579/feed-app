export interface NormalizedProduct {
  id: string;           
  shopifyId: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;      
  productType: string | null; 
  status: string;
  link: string | null;     
  category: string | null;
  images: { url: string; altText: string | null }[];
  variants: NormalizedVariant[];
}

export interface NormalizedVariant {
  id: string;           
  shopifyId: string;     
  sku: string | null;
  barcode: string | null; 
  priceMinor: number | null;          
  salePriceMinor: number | null;
  inventoryQuantity: number;
  isAvailable: boolean;
}