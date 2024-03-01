USING PROGRESS.json.ObjectModel.*.

DEFINE VARIABLE aTables   AS JsonArray    NO-UNDO.
DEFINE VARIABLE aFields   AS JsonArray    NO-UNDO.
DEFINE VARIABLE oTable    AS JsonObject   NO-UNDO.
DEFINE VARIABLE oField    AS JsonObject   NO-UNDO.

DEFINE VARIABLE databaseName AS CHARACTER   NO-UNDO.


aTables = NEW JsonArray().

FOR EACH mgcad._File
    WHERE  _File._Hidden = NO NO-LOCK:
    
    aFields = NEW JsonArray().
    
    FOR EACH _Field
        WHERE _Field._File-Recid = RECID(_File) NO-LOCK:
        
        oField = NEW JsonObject().
        oField:ADD("fieldName", _Field._Field-Name).
        oField:ADD("fieldType", _Field._Data-Type).
        
        aFields:ADD(oField).
        
    END.
    
    oTable = NEW JsonObject().
    oTable:ADD("tableName", _File._File-Name).
    oTable:ADD("databaseName", "mgcad").
    oTable:ADD("fields", aFields).
    
    aTables:ADD(oTable).
    
    
END.

aTables:WriteFile(INPUT "c:\tmp\teste.json").

