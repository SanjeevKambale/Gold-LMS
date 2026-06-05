import { Customer } from '../../types';
import { cachedCustomers, syncWrite } from '../database';

export function getAllCustomers(): Customer[] {
  return cachedCustomers;
}

export function addCustomer(customer: Customer): void {
  // 1. Add to cache synchronously (unshift to put the newest at the top)
  cachedCustomers.unshift(customer);

  // 2. Sync locally and to Supabase
  const payload = {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    kyc_status: customer.kycStatus,
    kyc_document: customer.kycDocument,
    kyc_number: customer.kycNumber,
    created_at: customer.createdAt,
    photo_url: customer.photoUrl || null,
    created_by: customer.createdBy || null,
    kyc_docs_json: JSON.stringify(customer.kycDocuments || []),
  };

  syncWrite('customers', 'insert', customer.id, payload);
}

export function updateCustomer(customer: Customer): void {
  // 1. Update cache synchronously
  const idx = cachedCustomers.findIndex(c => c.id === customer.id);
  if (idx !== -1) {
    cachedCustomers[idx] = customer;
  }

  // 2. Sync locally and to Supabase
  const payload = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    kyc_status: customer.kycStatus,
    kyc_document: customer.kycDocument,
    kyc_number: customer.kycNumber,
    photo_url: customer.photoUrl || null,
    kyc_docs_json: JSON.stringify(customer.kycDocuments || []),
  };

  syncWrite('customers', 'update', customer.id, payload);
}

export function deleteCustomer(id: string): void {
  // 1. Delete from cache synchronously
  const idx = cachedCustomers.findIndex(c => c.id === id);
  if (idx !== -1) {
    cachedCustomers.splice(idx, 1);
  }

  // 2. Sync locally and to Supabase
  syncWrite('customers', 'delete', id);
}
