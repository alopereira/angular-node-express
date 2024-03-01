import { Field } from "./field";

export class RestAPI {
  apiName: string = "";
  tableName: string = "";
  apiVersion: string = "";
  moduleName: string = "";
  moduleDir: string = "";
  dboProgram: string = "";
  fields: Array<Field> = [];
}
