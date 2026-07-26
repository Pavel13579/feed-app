import { NormalizedProduct } from "app/types/NormalizedProduct";

export interface FeedRenderResult {
  xml: string;
  itemCount: number;
  skippedCount: number;
}

export interface FeedAdapter {
  channel: string;
  filename: string;
  render(products: NormalizedProduct[], shopDomain: string, context?: { skippedCount: number }): FeedRenderResult;
}


export interface GoogleItem {
  id: string;                    
  item_group_id: string;          
  title: string;                 
  description: string;           
  link: string;                  
  image_link: string;            
  availability: "in_stock" | "out_of_stock"; 
  price: string;                 
  condition: "new";              
  brand: string | null;          
  gtin: string | null;           
  mpn: string | null;            
  identifier_exists: "true" | "false";
}