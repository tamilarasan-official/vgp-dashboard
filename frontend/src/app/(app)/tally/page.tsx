import { UploadSection } from '../_uploads/upload-section';

export default function TallyPage() {
  return (
    <UploadSection
      source="tally"
      path="/tally"
      title="Accounts (Tally)"
      subtitle="Daily Excel exports from TallyPrime, uploaded by the accounts team"
      uploaderRole="tally_uploader"
      reportTypes={[
        { value: 'daybook', label: 'Day Book' },
        { value: 'trial_balance', label: 'Trial Balance' },
        { value: 'bills_receivable', label: 'Bills Receivable' },
        { value: 'bills_payable', label: 'Bills Payable' },
        { value: 'other', label: 'Other report' },
      ]}
      companies={['VGP Promoters Private Limited', 'VGP Madras Canteen LLP']}
      hint="Upload daily by 10 PM: Day Book (1st of month → today), Trial Balance (financial year → today), Bills Receivable and Bills Payable (as on today) – one file per company. Export from Tally as Excel (.xlsx)."
      emptyText="No Tally reports uploaded yet. The accounts team's daily uploads will appear here."
    />
  );
}
