import app from './app';
import { env } from './config/env';

const PORT = env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Document Storage Backend server running on http://localhost:${PORT}`);
  console.log(`📡 API Base Path: http://localhost:${PORT}/api`);
  console.log(`🛡️  Admin Username: ${env.ADMIN_USERNAME}`);
});
