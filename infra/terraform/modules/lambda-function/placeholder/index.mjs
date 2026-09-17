// Placeholder code so Terraform can create functions before the first app deploy.
// scripts/deploy/deploy.sh replaces it; Terraform ignores code changes afterwards.
const body = JSON.stringify({ error: { code: 'NOT_DEPLOYED', message: 'Application code has not been deployed yet' } });

export const handler = async () => ({ statusCode: 503, headers: { 'content-type': 'application/json' }, body });
export const importWorker = async () => {
  throw new Error('import worker not deployed yet');
};
export const notifier = async () => {
  throw new Error('notifier not deployed yet');
};
