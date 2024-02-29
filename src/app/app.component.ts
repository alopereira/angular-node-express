import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

import { PoDialogService, PoNotificationService, PoPageAction, PoSelectOption } from '@po-ui/ng-components';
import { Keys } from '@progress/kendo-angular-common';
import { CellClickEvent, CellCloseEvent } from '@progress/kendo-angular-grid';
import { APIField } from 'src/models/api-field.model';
import { RestAPI } from 'src/models/rest-api.model';
import { GridEditService } from 'src/services/grid-edit.service';
import { SchemaService } from 'src/services/schema.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  public isLoading: boolean = false;
  public isLoadingFields: boolean = false;
  public api: RestAPI = new RestAPI();
  public fieldColumns: Array<any> = [];
  public selectedDB: string = "";
  public selectedTable: string = "";
  public isCRUD: boolean = false;
  public tableList: Array<PoSelectOption> = [];
  public DBList: Array<PoSelectOption> = [
    {
      label: "emscad",
      value: "emscad",
    },
    {
      label: "emsfnd",
      value: "emsfnd",
    },
    {
      label: "emsmov",
      value: "emsmov",
    },
    {
      label: "mgcad",
      value: "mgcad",
    },
    {
      label: "mgmov",
      value: "mgmov",
    },
  ];

  public pageActions: Array<PoPageAction> = [
    {
      label: "Gerar API",
      action: this.onClickGenerateAPI.bind(this),
      icon: "po-icon-ok",
    },
  ];

  constructor(
    private schemaService: SchemaService,
    private formBuilder: FormBuilder,
    private editService: GridEditService,
    private dialogService: PoDialogService,
    private notificationService: PoNotificationService
  ) {}

  ngOnInit(): void {}

  onClickGenerateAPI() {
    if (!this.validateFields()) return;

    this.schemaService.generate(this.api);
  }

  onChangeDatabase() {
    this.isLoading = true;
    this.schemaService.tableQuery(this.selectedDB).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.tableList = response;
        this.selectedTable = "";
        this.api.fields = [];
      },
      error: (err) => {
        this.isLoading = false;
      },
    });
  }

  onChangeTable(event: any) {
    if (event) {
      this.api.fields = event.fields;
      this.api.tableName = this.selectedTable;
    } else {
      this.api.fields = [];
      this.api.tableName = "";
    }
  }

  validateFields(): boolean {
    if (this.isCRUD && !this.api.dboProgram) {
      this.notificationService.error(
        "Para geração dos métodos CRUD é necessário informar o nome da BO da tabela."
      );

      return false;
    }

    if (
      !this.api.apiName ||
      !this.api.apiVersion ||
      !this.api.moduleDir ||
      !this.api.moduleName ||
      !this.api.tableName
    ) {
      this.notificationService.error(
        "Preencha todas as informações do formulário antes de gerar a API!"
      );
      return false;
    }

    if (this.api.fields.some((field) => !field.serializeName)) {
      this.dialogService.confirm({
        title: "Existem campos sem Nome Serializado informado",
        message:
          "Somente campos que possuem nome serializado preenchidos serão considerados durante a geração da API. Deseja continuar?",
        confirm: () => {
          this.api.fields = this.api.fields.filter(
            (field) => field.serializeName
          );
          return true;
        },
        cancel: () => {
          return false;
        },
      });
    } else {
      return true;
    }

    return false;
  }

  public cellClickHandler(args: CellClickEvent): void {
    if (!args.isEdited) {
      args.sender.editCell(
        args.rowIndex,
        args.columnIndex,
        this.createFormGroup(args.dataItem)
      );
    }
  }

  public cellCloseHandler(args: CellCloseEvent): void {
    const { formGroup, dataItem } = args;

    if (!formGroup.valid) {
      args.preventDefault();
    } else if (formGroup.dirty) {
      if (args.originalEvent && args.originalEvent.keyCode === Keys.Escape) {
        return;
      }

      this.editService.assignValues(dataItem, formGroup.value);
      this.editService.update(dataItem);
    }
  }

  public createFormGroup(dataItem: APIField): FormGroup {
    return this.formBuilder.group({
      name: dataItem.fieldName,
      type: dataItem.fieldType,
      serializeName: dataItem.serializeName,
    });
  }
}
