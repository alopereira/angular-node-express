import { APIField } from './api-field.model';

export class Tabela {
  tableName: string = '';
  databaseName: string = '';
  fields: Array<APIField> = [];
}
