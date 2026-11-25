import { UploadSection } from '../_uploads/upload-section';

export default function FeedbackPage() {
  return (
    <UploadSection
      source="thoughtmetrics"
      path="/feedback"
      title="Customer Feedback"
      subtitle="Thought Metrics survey reports, uploaded by the VGP team"
      uploaderRole="feedback_uploader"
      reportTypes={[
        { value: 'survey_responses', label: 'Survey responses' },
        { value: 'nps_summary', label: 'NPS / summary report' },
        { value: 'other', label: 'Other report' },
      ]}
      companies={[]}
      hint="Upload the Thought Metrics export (Excel or CSV preferred, PDF accepted) with the period it covers."
      emptyText="No feedback reports uploaded yet. Thought Metrics reports will appear here once uploaded."
    />
  );
}
