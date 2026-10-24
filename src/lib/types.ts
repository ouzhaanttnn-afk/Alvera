export const statuses = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const;
export type Status = (typeof statuses)[number];
export const statusLabels: Record<Status, string> = {
  DRAFT: 'Taslak',
  SUBMITTED: 'Yeni başvuru',
  IN_REVIEW: 'İnceleniyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
};
export const transitions: Record<Status, Status[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['IN_REVIEW', 'REJECTED'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: ['IN_REVIEW'],
};
export type ApplicationData = {
  kind: 'individual' | 'corporate';
  identityNumber: string;
  identityType: string;
  name: string;
  province: string;
  district: string;
  neighborhood: string;
  phone: string;
  email: string;
  address: string;
  nationality: string;
  occupation: string;
  amount: string;
  noticeRead: boolean;
};
export type PublicPolicy = {
  documents: boolean;
  signature: boolean;
  residence?: boolean;
  residenceRequired?: boolean;
  required: string[];
  maxUploadMB: number;
  siteKey: string;
  local: boolean;
  noticeVersion: string;
  previewOnly?: boolean;
};
export type Application = {
  id: string;
  reference: string;
  created_at: string;
  status: Status;
  kind: ApplicationData['kind'];
  masked_identity: string;
  payload: string;
  intake_id: string;
  deletion_requested_at: string | null;
  notice_version: string;
};
export type Document = {
  id: string;
  application_id: string | null;
  intake_id: string;
  kind: 'front' | 'back' | 'signature' | 'residence';
  path: string;
  mime: string;
  size: number;
  created_at: string;
};
export type History = {
  id: string;
  application_id: string;
  created_at: string;
  actor: string;
  action: string;
  status: Status | null;
  note: string | null;
};
export type Outbox = {
  id: string;
  application_id: string;
  audience: 'admin' | 'applicant';
  state: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  next_attempt_at: string;
  lease_until: string | null;
  last_error: string | null;
  created_at: string;
};
export type Detail = {
  application: Application;
  data: ApplicationData;
  documents: Document[];
  history: History[];
  notifications: Outbox[];
};
