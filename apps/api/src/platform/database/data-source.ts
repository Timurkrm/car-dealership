import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../../config/config';
import { databaseOptions } from './database-options';
export default new DataSource(databaseOptions(loadConfig()));
