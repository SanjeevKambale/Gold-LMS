import { Customer, KYCDocument } from '../../types';
import { getDB, saveDB } from '../database';

function rowToCustomer(row: any[]): Customer {
  const kycDocsJson = row[11] as string | undefined;
  let kycDocuments: KYCDocument[] = [];
  
  try {
    if (kycDocsJson) {
      kycDocuments = JSON.parse(kycDocsJson);
    } else {
      // Migrate from legacy fields if new ones are empty
      kycDocuments = [{
        id: 'legacy-1',
        type: row[6] as string,
        number: row[7] as string,
        status: row[5] as 'pending' | 'verified' | 'rejected',
      }];
    }
  } catch (e) {
    console.error('Failed to parse kycDocsJson', e);
  }

  return {
    id: row[0] as string,
    name: row[1] as string,
    email: row[2] as string,
    phone: row[3] as string,
    address: row[4] as string,
    kycStatus: row[5] as 'pending' | 'verified' | 'rejected',
    kycDocument: row[6] as string,
    kycNumber: row[7] as string,
    kycDocuments,
    createdAt: row[8] as string,
    photoUrl: row[9] as string | undefined,
    createdBy: row[10] as string | undefined,
  };
}

export function getAllCustomers(): Customer[] {
  const db = getDB();
  const result = db.exec(
    'SELECT id, name, email, phone, address, kyc_status, kyc_document, kyc_number, created_at, photo_url, created_by, kyc_docs_json FROM customers ORDER BY created_at DESC'
  );
  if (!result.length) return [];
  return result[0].values.map(rowToCustomer);
}

export function addCustomer(customer: Customer): void {
  const db = getDB();
  db.run(
    `INSERT INTO customers (id, name, email, phone, address, kyc_status, kyc_document, kyc_number, created_at, photo_url, created_by, kyc_docs_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customer.id,
      customer.name,
      customer.email,
      customer.phone,
      customer.address,
      customer.kycStatus,
      customer.kycDocument,
      customer.kycNumber,
      customer.createdAt,
      customer.photoUrl ?? null,
      customer.createdBy ?? null,
      JSON.stringify(customer.kycDocuments || []),
    ]
  );
  saveDB();
}

export function updateCustomer(customer: Customer): void {
  const db = getDB();
  db.run(
    `UPDATE customers SET name=?, email=?, phone=?, address=?, kyc_status=?, kyc_document=?, kyc_number=?, photo_url=?, kyc_docs_json=?
     WHERE id=?`,
    [
      customer.name,
      customer.email,
      customer.phone,
      customer.address,
      customer.kycStatus,
      customer.kycDocument,
      customer.kycNumber,
      customer.photoUrl ?? null,
      JSON.stringify(customer.kycDocuments || []),
      customer.id,
    ]
  );
  saveDB();
}

export function deleteCustomer(id: string): void {
  const db = getDB();
  db.run('DELETE FROM customers WHERE id=?', [id]);
  saveDB();
}
