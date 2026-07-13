import { IGraphQlResponseType, IMappedProduct } from "app/types/types";

export function mapShopifyProduct(node: IGraphQlResponseType): IMappedProduct {
    const parsedId = parseIdFromGid(node.id);
    
    const product = {
    shopifyId: parsedId,
    title: node.title,
    descriptionHtml: node.descriptionHtml,
    vendor: node.vendor,
    productType: node.productType,
    status: node.status,
    tags: node.tags ? node.tags.join(', ') : null,
  };

  const variantsEdges = node.variants?.edges || [];
  const variants = variantsEdges.map((edge) => {
    const vNode = edge.node;
    const parsedIdVariant = parseIdFromGid(vNode.id);
    return {
      shopifyId: parsedIdVariant,
      sku: vNode.sku,
      barcode: vNode.barcode,
      price: vNode.price, 
      compareAtPrice: vNode.compareAtPrice, 
      inventoryQuantity: vNode.inventoryQuantity,
    };
  });

  const imagesEdges = node.images?.edges || [];
  const images = imagesEdges.map((edge, index: number) => {
    const iNode = edge.node;
    const parsedIdImage = parseIdFromGid(iNode.id);
    return{
        shopifyId: parsedIdImage,
        url: iNode.url,
        altText: iNode.altText,
        position: index + 1,
    };
  });

  return {
    ...product,
    variants,
    images,
  };
    
}


function parseIdFromGid(gid: string): string {  
  const parts = gid.split('/');
  return parts[parts.length - 1] || '';
}