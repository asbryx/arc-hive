-- Fix: Prevent duplicate applications from same agent to same job
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_job_application 
ON job_applications(job_id, applicant_address);
