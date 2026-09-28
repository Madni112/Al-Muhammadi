/**
 * Commercial Invoicing & Billing Utilities
 * AL MUHAMMADI
 */

export interface InvoiceItemPayload {
  hsCode?: string;
  productDescription: string;
  rate: string | number;
  uoM: string;
  quantity: number;
  totalValues: number;
  discount: number;
}

export interface CommercialInvoicePayload {
  invoiceDate: string;
  sellerBusinessName: string;
  sellerAddress: string;
  buyerName: string;
  items: InvoiceItemPayload[];
}
