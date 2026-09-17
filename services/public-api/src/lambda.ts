import { handle } from 'hono/aws-lambda';
import { createApp } from './app';
import { createContext } from './context';
import { loadEnv } from './env';

// Created once per Lambda container; the catalog cache lives across warm invocations.
export const handler = handle(createApp(createContext(loadEnv())));
