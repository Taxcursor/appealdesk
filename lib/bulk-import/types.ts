// lib/bulk-import/types.ts

export type ImportType = "clients" | "team-users" | "client-users";

export interface ClientOrgOption {
  id: string;
  name: string;
}

export interface ParsedClientRow {
  rowNumber: number;
  name: string;
  file_number?: string;
  pan_number: string;
  business_type?: string;
  date_of_incorporation?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  country?: string;
  /** NOTE: These compliance credential fields contain sensitive data.
   *  They must only be passed to server actions via HTTPS and never logged. */
  pan_login_id?: string;
  pan_password?: string;
  gst_number?: string;
  gst_login_id?: string;
  gst_password?: string;
  tan_number?: string;
  tan_login_id?: string;
  tan_password?: string;
  /** Only stored when business_type is "Individual" */
  aadhaar_number?: string;
}

export interface ParsedTeamUserRow {
  rowNumber: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  middle_name?: string;
  mobile_number?: string;
  mobile_country_code?: string;
  date_of_birth?: string;
  department?: string;
  designation?: string;
  date_of_joining?: string;
  date_of_leaving?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;   // maps to `location` column in DB
  pin_code?: string;
  country?: string;
  pan_number?: string;
  aadhaar_number?: string; // maps to `aadhar_number` column in DB
}

export interface ParsedClientUserRow {
  rowNumber: number;
  first_name: string;
  last_name: string;
  email: string;
  client_org_name: string;
  middle_name?: string;
  mobile_number?: string;
  mobile_country_code?: string;
  date_of_birth?: string;
}

export type ValidatedRow<T> =
  | { row: T; status: "valid" }
  | { row: T; status: "error"; error: string };
