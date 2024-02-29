import { TableField } from "./table-field";

export class DatabaseTable {
  tableName: string = "";
  databaseName: string = "";
  fields: Array<TableField> = [];
}
