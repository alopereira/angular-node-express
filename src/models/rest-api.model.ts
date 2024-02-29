import { APIField } from "./api-field.model";

export class RestAPI {
  apiName: string = "";
  tableName: string = "";
  apiVersion: string = "";
  moduleName: string = "";
  moduleDir: string = "";
  dboProgram: string = "";
  fields: Array<APIField> = [];
}
