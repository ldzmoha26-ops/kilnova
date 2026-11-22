import { createKilnovaApiApp } from '../src/server/createKilnovaApiApp.ts';

const { app } = createKilnovaApiApp({ isServerless: true });

export default app;
