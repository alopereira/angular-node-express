const fs = require("fs");
const archiver = require("archiver");
const path = require("path");
var cors = require("cors");

const corsOption = {
  credentials: true,
  origin: ["http://localhost:4200"],
};

const express = require("express");
const app = express();

// handling CORS
app.use(cors(corsOption));
app.use(express.json())

// route for handling requests from the Angular client
app.get("/api/schema", async (req, res) => {
  
  try {
    const data = await fs.promises.readFile(
      `./db_definitions/db_${req.query.dbName}_definitions.json`,
      "utf8"
    );
    const jsonData = JSON.parse(data);

    res.json({
      status: 200,
      body: jsonData,
    });
  } catch (err) {
    console.error(err);
    res.json({
      status: 500,
      body: { message: "Erro ao gerar a API" },
    });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    // Extract request body parameters
    const {
      apiName,
      tableName,
      apiVersion,
      moduleName,
      moduleDir,
      dboProgram,
      fields,
    } = req.body;

    // Generate API, API Service, and Temp Table code
    const apiOutputPath = await generateApi(
      apiName,
      apiVersion,
      moduleName,
      moduleDir,
      dboProgram,
      fields
    );
    const serviceOutputPath = await generateApiService(
      tableName,
      apiName,
      moduleName,
      moduleDir,
      fields,
      dboProgram
    );
    const tempTableOutputPath = await generateTempTableCode(
      apiName,
      moduleDir,
      fields
    );

    // Create a writable stream to save the zip file
    const output = fs.createWriteStream("api_gerada.zip");

    // Create a new archiver instance and set the output stream
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Set compression level (optional)
    });
    archive.pipe(output);

    // Add files to the archive
    archive.file(apiOutputPath, {
      name: `${moduleDir}/api/${apiVersion}/${path.basename(apiOutputPath)}`,
    });
    archive.file(serviceOutputPath, {
      name: `${moduleDir}/services/${path.basename(serviceOutputPath)}`,
    });
    archive.file(tempTableOutputPath, {
      name: `${moduleDir}/services/${path.basename(tempTableOutputPath)}`,
    });

    // Finalize the archive
    archive.finalize();

    // Wait for the archive to be finalized
    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
    });

    // Read the file from the local path
    const fileData = fs.readFileSync("api_gerada.zip");

    // Set the response headers
    res.status(200).attachment("api_gerada.zip").send(fileData);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

async function generateTempTableCode(apiName, moduleDir, fields) {
  const className = apiName.charAt(0).toUpperCase() + apiName.slice(1);

  let code = `DEFINE TEMP-TABLE {1} NO-UNDO SERIALIZE-NAME '${className}':U\n`;

  fields.forEach((field) => {
    code += `    FIELD ${field.name} AS ${field.type} INITIAL ? SERIALIZE-NAME '${field.serializeName}':U\n`;
  });

  code += `.\n\n`;

  const outputPath = `c:/temp/api_generate/${moduleDir}/services/api${className}.i`;

  // Create the folder if it doesn't exist
  if (!fs.existsSync(`c:/temp/api_generate/${moduleDir}/services/api`)) {
    fs.mkdirSync(`c:/temp/api_generate/${moduleDir}/services/api`, {
      recursive: true,
    });
  }

  fs.writeFileSync(outputPath, code);

  return outputPath;
}

async function generateApi(
  apiName,
  apiVersion,
  moduleName,
  moduleDir,
  dboProgram
) {
  let code = `
USING Progress.Lang.Error.
USING com.totvs.framework.api.JsonApiResponseBuilder.

{utp/ut-api.i}
{utp/ut-api-utils.i}

{utp/ut-api-action.i pi-get   GET /~*/}
{utp/ut-api-action.i pi-query GET /~*}\n`;

  if (dboProgram) {
    code += `{utp/ut-api-action.i pi-create POST /~*}\n`;
    code += `{utp/ut-api-action.i pi-update PUT /~*}\n`;
    code += `{utp/ut-api-action.i pi-delete DELETE /~*}\n`;
  }
  code += `{utp/ut-api-notfound.i}

{include/i-prgvrs.i ${apiName} 2.00.00.001 }
{include/i-license-manager.i ${apiName} ${moduleName}}

DEFINE VARIABLE apiHandler AS HANDLE NO-UNDO.

/*:T--- PROCEDURES V1 ---*/

PROCEDURE pi-get:
  
  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.
  
  IF NOT VALID-HANDLE(apiHandler) THEN DO:
      RUN ${moduleDir}/api${apiName}.p PERSISTENT SET apiHandler.
  END.

  RUN pi-get-v1 IN apiHandler (
      INPUT oInput,
      OUTPUT oOutput,
      OUTPUT TABLE RowErrors
  ).

  IF CAN-FIND(FIRST RowErrors WHERE UPPER(RowErrors.ErrorSubType) = 'ERROR':U) THEN DO:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(TEMP-TABLE RowErrors:HANDLE).
  END.
  ELSE DO:
      IF oOutput EQ ? THEN DO:
          ASSIGN oOutput = JsonApiResponseBuilder:empty(404).
      END.
      ELSE DO:
          ASSIGN oOutput = JsonApiResponseBuilder:ok(oOutput).
      END.
  END.

  CATCH oE AS Error:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(oE).
  END CATCH.

  FINALLY: DELETE PROCEDURE apiHandler NO-ERROR. END FINALLY.

END PROCEDURE.

PROCEDURE pi-query:

  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.

  RUN pi-query-protected (INPUT oInput,
                          OUTPUT oOutput).

  IF RETURN-VALUE = "TIMEOUT":U THEN DO:
      CREATE RowErrors.
      ASSIGN RowErrors.ErrorNumber = 9999
             RowErrors.ErrorSubType = 'ERROR':U
             RowErrors.ErrorDescription = 'TIMEOUT':U.
      ASSIGN oOutput = JsonApiResponseBuilder:asError(TEMP-TABLE RowErrors:HANDLE).
  END.

  CATCH oE AS ERROR:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(oE).
  END CATCH.

END PROCEDURE.

PROCEDURE pi-query-protected:
  
  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.

  DEFINE VARIABLE lHasNext AS LOGICAL   NO-UNDO.
  DEFINE VARIABLE aResult  AS JsonArray NO-UNDO.

  IF NOT VALID-HANDLE(apiHandler) THEN DO:
      RUN ${moduleDir}/api${apiName}.p PERSISTENT SET apiHandler.
  END.

  DO TRANS ON STOP UNDO, RETURN "NOK":
      RUN pi-query-v1 IN apiHandler (
          INPUT oInput,
          OUTPUT aResult,
          OUTPUT lHasNext,
          OUTPUT TABLE RowErrors
      ).

      IF RETURN-VALUE = "TIMEOUT_NOK" THEN DO:
          CREATE RowErrors.
          ASSIGN RowErrors.ErrorNumber = 9999
                 RowErrors.ErrorSubType = 'ERROR':U
                 RowErrors.ErrorDescription = "A consulta excedeu o tempo maximo de 60 segundos, por favor aprimore o seu 
                                               filtro.".
      END.
  END.

  IF CAN-FIND(FIRST RowErrors WHERE UPPER(RowErrors.ErrorSubType) = 'ERROR':U) THEN DO:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(TEMP-TABLE RowErrors:HANDLE).
  END.
  ELSE DO:
      ASSIGN oOutput = JsonApiResponseBuilder:ok(aResult, lHasNext).
  END.
  
  CATCH oE AS ERROR:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(oE).
  END CATCH.
  
  FINALLY: DELETE PROCEDURE apiHandler NO-ERROR. END FINALLY.
  
END PROCEDURE.\n\n`;

  if (dboProgram) {
    code += `
PROCEDURE pi-create:

  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.

  IF NOT VALID-HANDLE(apiHandler) THEN DO:
      RUN ${moduleDir}/api${apiName}.p PERSISTENT SET apiHandler.
  END.

  RUN pi-create-v1 IN apiHandler (
      INPUT oInput,
      OUTPUT oOutput,
      OUTPUT TABLE RowErrors
  ).

  IF CAN-FIND(FIRST RowErrors WHERE UPPER(RowErrors.ErrorSubType) = 'ERROR':U) THEN DO:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(TEMP-TABLE RowErrors:HANDLE).
  END.
  ELSE DO:
      ASSIGN oOutput = JsonApiResponseBuilder:ok(oOutput, 201).
  END.

  CATCH oE AS Error:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(oE).
  END CATCH.
  
  FINALLY: DELETE PROCEDURE apiHandler NO-ERROR. END FINALLY.

END PROCEDURE.

PROCEDURE pi-update:

  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.

  IF NOT VALID-HANDLE(apiHandler) THEN DO:
      RUN ${moduleDir}/api${apiName}.p PERSISTENT SET apiHandler.
  END.

  RUN pi-update-v1 IN apiHandler (
      INPUT oInput,
      OUTPUT oOutput,
      OUTPUT TABLE RowErrors
  ).

  IF CAN-FIND(FIRST RowErrors WHERE UPPER(RowErrors.ErrorSubType) = 'ERROR':U) THEN DO:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(TEMP-TABLE RowErrors:HANDLE).
  END.
  ELSE IF oOutput EQ ? THEN DO:
      ASSIGN oOutput = JsonApiResponseBuilder:empty(404).
  END.
  ELSE DO:
      ASSIGN oOutput = JsonApiResponseBuilder:ok(oOutput).
  END.

  CATCH oE AS Error:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(oE).
  END CATCH.
  
  FINALLY: DELETE PROCEDURE apiHandler NO-ERROR. END FINALLY.

END PROCEDURE.

PROCEDURE pi-delete:
  
  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.
 
  IF NOT VALID-HANDLE(apiHandler) THEN DO:
      RUN ${moduleDir}/api${apiName}.p PERSISTENT SET apiHandler.
  END.

  RUN pi-delete-v1 IN apiHandler (
      INPUT oInput,
      OUTPUT TABLE RowErrors
  ).

  IF CAN-FIND(FIRST RowErrors WHERE UPPER(RowErrors.ErrorSubType) = 'ERROR':U) THEN DO:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(TEMP-TABLE RowErrors:HANDLE).
  END.
  ELSE DO:
      ASSIGN oOutput = JsonApiResponseBuilder:empty().
  END.

  CATCH oE AS Error:
      ASSIGN oOutput = JsonApiResponseBuilder:asError(oE).
  END CATCH.
  
  FINALLY: DELETE PROCEDURE apiHandler NO-ERROR. END FINALLY.

END PROCEDURE.\n\n`;
  }

  const outputPath = `c:/temp/api_generate/${moduleDir}/api/${apiVersion}/${apiName}.p`;

  if (!fs.existsSync(`c:/temp/api_generate/${moduleDir}/api/${apiVersion}`)) {
    fs.mkdirSync(`c:/temp/api_generate/${moduleDir}/api/${apiVersion}`, {
      recursive: true,
    });
  }

  fs.writeFileSync(outputPath, code);

  return outputPath;
}

async function generateApiService(
  tableName,
  apiName,
  moduleName,
  moduleDir,
  fields,
  dboProgram
) {
  const className = apiName.charAt(0).toUpperCase() + apiName.slice(1);

  let code = `BLOCK-LEVEL ON ERROR UNDO, THROW.\n\n`;
  code += `USING PROGRESS.json.*.\n`;
  code += `USING PROGRESS.json.ObjectModel.*.\n`;
  code += `USING com.totvs.framework.api.*.\n\n`;

  code += `{include/i-prgvrs.i ${className} 2.00.00.001 }\n`;
  code += `{include/i-license-manager.i api${className} ${moduleName}}\n\n`;

  code += `{cdp/utils.i}\n`;
  code += `{man/logUtils.i}\n\n`;

  code += `{method/dbotterr.i}\n`;
  if (dboProgram) {
    code += `{${dboProgram.replace(".p", ".i")} RowObject}\n`;
  }

  code += `{${moduleDir}/services/api${className}.i ${className}}\n\n`;

  code += `DEFINE VARIABLE boHandler AS HANDLE NO-UNDO.\n\n`;

  code += `/*:T--- FUNCTIONS ---*/\n\n`;

  code += `FUNCTION fn-get-id-from-path RETURNS CHARACTER (\n`;
  code += `INPUT oRequest AS JsonAPIRequestParser\n`;
  code += `) FORWARD.\n\n`;

  code += `FUNCTION fn-has-row-errors RETURNS LOGICAL () FORWARD.\n\n`;

  code +=
    `FUNCTION fn-get-id-from-path RETURNS CHARACTER (\n` +
    `    INPUT oRequest AS JsonAPIRequestParser\n` +
    `):\n` +
    `    RETURN oRequest:getPathParams():GetCharacter(1).\n` +
    `END FUNCTION.\n\n`;

  code +=
    `FUNCTION fn-has-row-errors RETURNS LOGICAL ():\n` +
    `\n` +
    `    FOR EACH RowErrors\n` +
    `        WHERE UPPER(RowErrors.ErrorType) = 'INTERNAL':U:\n` +
    `        DELETE RowErrors.\n` +
    `    END.\n` +
    `\n` +
    `    RETURN CAN-FIND(FIRST RowErrors\n` +
    `        WHERE UPPER(RowErrors.ErrorSubType) = 'ERROR':U).\n` +
    `\n` +
    `END FUNCTION.\n\n`;

  code += `/*:T--- QUERY PROCEDURES V1 ---*/\n\n`;

  code += `PROCEDURE pi-get-v1:\n\n`;

  code += `   DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.\n`;
  code += `   DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.\n`;
  code += `   DEFINE OUTPUT PARAM TABLE FOR RowErrors.\n\n`;

  code += `   DEFINE VARIABLE oRequest        AS JsonAPIRequestParser NO-UNDO.\n`;
  code += `   DEFINE VARIABLE cExcept         AS CHARACTER            NO-UNDO.\n`;
  code += `   DEFINE VARIABLE tableKey        AS character            NO-UNDO.\n`;
  code += `   DEFINE VARIABLE logGetById      AS LOGICAL              NO-UNDO.\n`;
  code += `   DEFINE VARIABLE iCount          AS INTEGER              NO-UNDO.\n`;
  code += `   DEFINE VARIABLE cExpandable     AS CHARACTER            NO-UNDO.\n`;
  code += `   DEFINE VARIABLE cPeriodType     AS CHARACTER            NO-UNDO.\n`;
  code += `   DEFINE VARIABLE iCountExpand    AS INTEGER              NO-UNDO.\n\n`;

  code += `   ASSIGN oRequest = NEW JsonAPIRequestParser(oInput).\n\n`;

  code += `   IF oRequest:getQueryParams():has("id") THEN DO:\n`;
  code += `       ASSIGN tableKey = INPUT oRequest:getQueryParams():GetJsonArray("id"):GetCharacter(1).\n`;
  code += `   END.\n`;

  code += `   ASSIGN cExcept = JsonAPIUtils:getTableExceptFieldsBySerializedFields(\n`;
  code += `       TEMP-TABLE ${className}:HANDLE, oRequest:getFields()\n`;
  code += `   ).\n\n`;

  code += `   FOR FIRST ${tableName} FIELDS (\n`;

  fields.forEach((field, index) => {
    if (field.name != "r-rowid") {
      code += `       ${field.name}${index !== fields.length - 1 ? " " : ""}\n`;
    }
  });

  code += `       ) NO-LOCK\n`;
  code += `       WHERE ROWID(${tableName}) EQ TO-ROWID(tableKey):\n\n`;

  code += `       CREATE ${className}.\n`;
  code += `       TEMP-TABLE ${className}:HANDLE:DEFAULT-BUFFER-HANDLE:BUFFER-COPY(\n`;
  code += `           BUFFER ${tableName}:HANDLE, cExcept\n`;
  code += `       ).\n`;

  code += `       ASSIGN ${className}.r-rowid = STRING(ROWID(${tableName})).   \n\n`;

  code += `   END.\n\n`;

  code += `   ASSIGN oOutput = JsonAPIUtils:convertTempTableFirstItemToJsonObject(\n`;
  code += `       TEMP-TABLE ${className}:HANDLE, (LENGTH(TRIM(cExcept)) > 0)\n`;
  code += `   ).\n`;

  code += `   CATCH eSysError AS Progress.Lang.SysError:\n`;
  code += `       CREATE RowErrors.\n`;
  code += `       ASSIGN RowErrors.ErrorNumber = 17006\n`;
  code += `              RowErrors.ErrorDescription = eSysError:getMessage(1)\n`;
  code += `              RowErrors.ErrorSubType = "ERROR".\n`;
  code += `   END.\n`;
  code += `   FINALLY:\n`;
  code += `       IF fn-has-row-errors() THEN DO:\n`;
  code += `           UNDO, RETURN 'NOK':U.\n`;
  code += `       END.\n`;
  code += `   END FINALLY.\n\n`;

  code += `END PROCEDURE.\n\n`;

  code += `PROCEDURE pi-query-v1:\n\n`;
  code += `    DEFINE INPUT  PARAM oInput   AS JsonObject NO-UNDO.\n`;
  code += `    DEFINE OUTPUT PARAM aOutput  AS JsonArray  NO-UNDO.\n`;
  code += `    DEFINE OUTPUT PARAM lHasNext AS LOGICAL    NO-UNDO INITIAL FALSE.\n`;
  code += `    DEFINE OUTPUT PARAM TABLE FOR RowErrors.\n\n`;

  code += `    EMPTY TEMP-TABLE RowErrors.\n`;
  code += `    EMPTY TEMP-TABLE ${className}.\n\n`;

  code += `    DEFINE VARIABLE oRequest      AS JsonAPIRequestParser  NO-UNDO.\n`;
  code += `    DEFINE VARIABLE iCount        AS INTEGER INITIAL 0     NO-UNDO.\n`;
  code += `    DEFINE VARIABLE iCountExpand  AS INTEGER INITIAL 0     NO-UNDO.\n\n`;

  code += `    DEFINE VARIABLE cExcept       AS CHARACTER             NO-UNDO.\n`;
  code += `    DEFINE VARIABLE cQuery        AS CHARACTER             NO-UNDO.\n`;
  code += `    DEFINE VARIABLE cBy           AS CHARACTER             NO-UNDO.\n\n`;

  code += `    ASSIGN oRequest = NEW JsonAPIRequestParser(oInput).\n\n`;
  code += `    ASSIGN cExcept = JsonAPIUtils:getTableExceptFieldsBySerializedFields(\n`;
  code += `        TEMP-TABLE ${className}:HANDLE, oRequest:getFields()\n`;
  code += `    ).\n\n`;
  code += `    ASSIGN cQuery = 'FOR EACH ${tableName} NO-LOCK':U.\n`;
  code += `        ASSIGN cQuery = buildWhere(TEMP-TABLE ${className}:HANDLE, oRequest:getQueryParams(), "", cQuery).\n\n`;
  code += `    ASSIGN cBy    = buildBy(TEMP-TABLE ${className}:HANDLE, oRequest:getOrder())\n`;
  code += `           cQuery = cQuery + cBy.\n\n`;
  code += `    DEFINE QUERY findQuery FOR ${tableName}\n`;
  code += `        FIELDS(`;

  const filteredFields = fields.filter((field) => field.name !== "r-rowid");
  const fieldNames = filteredFields.map((field) => field.name).join(" ");
  code += fieldNames;

  code += `)\n`;
  code += `    SCROLLING.\n\n`;
  code += `    DO STOP-AFTER 60 ON STOP UNDO, RETURN "TIMEOUT_NOK":\n`;
  code += `        QUERY findQuery:QUERY-PREPARE(cQuery).\n`;
  code += `        QUERY findQuery:QUERY-OPEN().\n`;
  code += `        QUERY findQuery:REPOSITION-TO-ROW(oRequest:getStartRow()).\n\n`;
  code += `        REPEAT:\n\n`;
  code += `            GET NEXT findQuery.\n`;
  code += `            IF QUERY findQuery:QUERY-OFF-END THEN LEAVE.\n\n`;

  code += `            IF oRequest:getPageSize() EQ iCount THEN DO:\n`;
  code += `                ASSIGN lHasNext = TRUE.\n`;
  code += `                LEAVE.\n`;
  code += `            END.\n\n`;

  code += `            CREATE ${className}.\n`;
  code += `            TEMP-TABLE ${className}:HANDLE:DEFAULT-BUFFER-HANDLE:BUFFER-COPY(\n`;
  code += `                BUFFER ${tableName}:HANDLE, cExcept\n`;
  code += `            ).\n\n`;
  code += `            ASSIGN ${className}.r-rowid = STRING(ROWID(${tableName})).\n\n`;
  code += `            ASSIGN iCount = iCount + 1.\n\n`;
  code += `        END.\n\n`;
  code += `    END.\n\n`;

  code += `    ASSIGN aOutput = JsonAPIUtils:convertTempTableToJsonArray(\n`;
  code += `         TEMP-TABLE ${className}:HANDLE, (LENGTH(TRIM(cExcept)) > 0)\n`;
  code += `    ).\n\n`;

  code += `   CATCH eSysError AS Progress.Lang.SysError:\n`;
  code += `       CREATE RowErrors.\n`;
  code += `       ASSIGN RowErrors.ErrorNumber = 17006\n`;
  code += `              RowErrors.ErrorDescription = eSysError:getMessage(1)\n`;
  code += `              RowErrors.ErrorSubType = "ERROR".\n`;
  code += `   END.\n`;
  code += `   FINALLY:\n`;
  code += `       IF fn-has-row-errors() THEN DO:\n`;
  code += `           UNDO, RETURN 'NOK':U.\n`;
  code += `       END.\n`;
  code += `   END FINALLY.\n\n`;

  code += `END PROCEDURE.\n\n`;

  if (dboProgram) {
    code += `/*:T--- DOMAIN PROCEDURES V1 ---*/

PROCEDURE pi-create-v1:

  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM TABLE FOR RowErrors.

  RUN pi-store-v1 IN THIS-PROCEDURE (
      INPUT oInput,
      INPUT FALSE,
      INPUT FALSE,
      OUTPUT oOutput
  ).

  CATCH eSysError AS Progress.Lang.SysError:
      CREATE RowErrors.
      ASSIGN RowErrors.ErrorNumber = 17006
              RowErrors.ErrorDescription = eSysError:getMessage(1)
              RowErrors.ErrorSubType = "ERROR".
  END.
  FINALLY: 
      IF fn-has-row-errors() THEN DO:
          UNDO, RETURN 'NOK':U.
      END.
  END FINALLY.

END PROCEDURE.

PROCEDURE pi-update-v1:

  DEFINE INPUT  PARAM oInput  AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM oOutput AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM TABLE FOR RowErrors.

  RUN pi-store-v1 IN THIS-PROCEDURE (
      INPUT oInput,
      INPUT TRUE,
      INPUT FALSE,
      OUTPUT oOutput
  ).

  CATCH eSysError AS Progress.Lang.SysError:
      CREATE RowErrors.
      ASSIGN RowErrors.ErrorNumber = 17006
              RowErrors.ErrorDescription = eSysError:getMessage(1)
              RowErrors.ErrorSubType = "ERROR".
  END.
  FINALLY:
      IF fn-has-row-errors() THEN DO:
          UNDO, RETURN 'NOK':U.
      END.
  END FINALLY.

END PROCEDURE.

PROCEDURE pi-delete-v1:

  DEFINE INPUT  PARAM oInput AS JsonObject NO-UNDO.
  DEFINE OUTPUT PARAM TABLE FOR RowErrors.

  EMPTY TEMP-TABLE RowErrors.

  DEFINE VARIABLE oRequest  AS JsonAPIRequestParser NO-UNDO.

  ASSIGN oRequest = NEW JsonAPIRequestParser(oInput).

  DEFINE VARIABLE tableRowid AS CHARACTER      NO-UNDO.
  ASSIGN tableRowid = fn-get-id-from-path(oRequest) NO-ERROR.
  
  IF tableRowid = ? THEN DO:
      {utp/ut-liter.i Chave_do_registro * }
      RUN utp/ut-msgs.p ("msg":U, 3553, trim(return-value)).
      CREATE RowErrors.
      ASSIGN RowErrors.ErrorNumber = 3553 /* Chave_do_registro não informado(a) */
              RowErrors.ErrorDescription = return-value
              RowErrors.ErrorSubType = "ERROR".
      RETURN "NOK":U.
  END. 

  persistenceTransaction:
  DO TRANSACTION:

      IF NOT VALID-HANDLE(boHandler) THEN DO:
          RUN ${dboProgram} PERSISTENT SET boHandler.
      END.

      RUN openQueryStatic  IN boHandler (INPUT 'Main':U).
      RUN emptyRowErrors   IN boHandler.
      RUN repositionRecord IN boHandler (INPUT TO-ROWID(tableRowid)).
      
      IF RETURN-VALUE = "NOK" THEN
          RETURN "NOK".
          
      RUN deleteRecord    IN boHandler.
      RUN getRowErrors    IN boHandler (OUTPUT TABLE RowErrors APPEND).
      
      IF fn-has-row-errors() THEN DO:
          LEAVE persistenceTransaction.
      END.
  END.

  CATCH eSysError AS Progress.Lang.SysError:
      CREATE RowErrors.
      ASSIGN RowErrors.ErrorNumber = 17006
              RowErrors.ErrorDescription = eSysError:getMessage(1)
              RowErrors.ErrorSubType = "ERROR".
  END.
  FINALLY: 
      
      DELETE PROCEDURE boHandler NO-ERROR.
      
      IF fn-has-row-errors() THEN DO:
          UNDO, RETURN 'NOK':U.
      END.
  END FINALLY.

END PROCEDURE.


/*:T--- PRIVATE PROCEDURES ---*/

PROCEDURE pi-store-v1:

  DEFINE INPUT  PARAM oInput    AS JsonObject NO-UNDO.
  DEFINE INPUT  PARAM isUpdate  AS LOGICAL    NO-UNDO INITIAL FALSE.
  DEFINE INPUT  PARAM isParcial AS LOGICAL    NO-UNDO INITIAL FALSE.
  DEFINE OUTPUT PARAM oOutput   AS JsonObject NO-UNDO.

  EMPTY TEMP-TABLE RowErrors.
  EMPTY TEMP-TABLE RowObject.

  DEFINE VARIABLE oRequest  AS JsonAPIRequestParser NO-UNDO.
  DEFINE VARIABLE oPayload  AS JsonObject           NO-UNDO.
  
  DEFINE VARIABLE hRowObject AS HANDLE NO-UNDO.
  hRowObject = TEMP-TABLE RowObject:HANDLE.

  
  DEFINE VARIABLE tableRowid AS CHARACTER      NO-UNDO.
  
  RUN displayJsonObject(oInput).
  
  ASSIGN oRequest = NEW JsonAPIRequestParser(oInput).
  ASSIGN oPayload = oRequest:getPayload().

  IF isUpdate THEN DO:
      ASSIGN tableRowid = fn-get-id-from-path(oRequest) NO-ERROR.
  END. 
  
  IF tableRowid = ? THEN DO:
      {utp/ut-liter.i Chave_do_registro * }
      RUN utp/ut-msgs.p ("msg":U, 3553, trim(return-value)).
      CREATE RowErrors.
      ASSIGN RowErrors.ErrorNumber = 3553 /* Chave_do_registro não informado(a) */
              RowErrors.ErrorDescription = return-value
              RowErrors.ErrorSubType = "ERROR".
      RETURN "NOK":U.
  END.
  
  persistenceTransaction:
  DO TRANSACTION:

      IF NOT VALID-HANDLE(boHandler) THEN DO:
          RUN ${dboProgram} PERSISTENT SET boHandler.
      END.

      RUN openQueryStatic IN boHandler (INPUT 'Main':U).
      RUN emptyRowErrors  IN boHandler.

      IF isUpdate THEN DO:
          
          RUN repositionRecord IN boHandler (INPUT tableRowid).
          
          IF UPPER(RETURN-VALUE) EQ 'NOK':U THEN DO:
              LEAVE persistenceTransaction.
          END.

          RUN getRecord IN boHandler (OUTPUT TABLE RowObject).
      END.
      ELSE DO:
          CREATE RowObject.
      END.

      FIND FIRST RowObject EXCLUSIVE-LOCK NO-ERROR.
      
      hRowObject:READ-JSON ("LONGCHAR", oPayload, "REPLACE").
      
      RUN setRecord      IN boHandler (INPUT TABLE RowObject).
      RUN emptyRowErrors IN boHandler.
      
      IF isUpdate THEN DO:
              RUN updateRecord IN boHandler.
      END.
      ELSE DO:
          RUN createRecord IN boHandler.
      END.

      EMPTY TEMP-TABLE ${className}.
      EMPTY TEMP-TABLE RowObject.

      RUN getRowErrors IN boHandler (OUTPUT TABLE RowErrors APPEND).
      RUN getRecord    IN boHandler (OUTPUT TABLE RowObject).

      IF fn-has-row-errors() THEN DO:
          LEAVE persistenceTransaction.
      END.
      
      FOR FIRST RowObject:
          CREATE ${className}.
          BUFFER-COPY RowObject EXCEPT r-rowid TO ${className}.
          ASSIGN ${className}.r-rowid = STRING(RowObject.r-rowid).
      END.
      
      ASSIGN oOutput = JsonAPIUtils:convertTempTableFirstItemToJsonObject(
          TEMP-TABLE ${className}:HANDLE
      ).
  END.
  
  RUN displayJsonObject(oOutput).
  
  CATCH eSysError AS Progress.Lang.SysError:
      CREATE RowErrors.
      ASSIGN RowErrors.ErrorNumber = 17006
              RowErrors.ErrorDescription = eSysError:getMessage(1)
              RowErrors.ErrorSubType = "ERROR".
  END.
  FINALLY:
      DELETE PROCEDURE boHandler NO-ERROR.
  END FINALLY.

END PROCEDURE. \n\n`;
  }

  const outputPath = `c:/temp/api_generate/${moduleDir}/services/api${className}.p`;

  if (!fs.existsSync(`c:/temp/api_generate/${moduleDir}/services`)) {
    fs.mkdirSync(`c:/temp/api_generate/${moduleDir}/services`, {
      recursive: true,
    });
  }

  fs.writeFileSync(outputPath, code);

  return outputPath;
}

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
