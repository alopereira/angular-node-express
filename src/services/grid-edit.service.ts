import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, zip } from 'rxjs';
import { APIField } from '../models/api-field.model';

const itemIndex = (item: APIField, data: APIField[]): number => {
  for (let idx = 0; idx < data.length; idx++) {
    if (data[idx].fieldName === item.fieldName) {
      return idx;
    }
  }

  return -1;
};

const cloneData = (data: APIField[]) =>
  data.map((item) => Object.assign({}, item));

@Injectable()
export class GridEditService extends BehaviorSubject<unknown[]> {
  private data: APIField[] = [];
  private originalData: APIField[] = [];
  private updatedItems: APIField[] = [];

  constructor(private http: HttpClient) {
    super([]);
  }

  public read(): void {
    if (this.data.length) {
      return super.next(this.data);
    }
  }

  public update(item: APIField): void {
    const index = itemIndex(item, this.updatedItems);
    if (index !== -1) {
      this.updatedItems.splice(index, 1, item);
    } else {
      this.updatedItems.push(item);
    }
  }

  public hasChanges(): boolean {
    return Boolean(this.updatedItems.length);
  }

  public saveChanges(): void {
    if (!this.hasChanges()) {
      return;
    }

    const completed = [];

    if (this.updatedItems.length) {
      completed.push(this.updatedItems);
    }

    this.reset();

    zip(...completed).subscribe(() => this.read());
  }

  public cancelChanges(): void {
    this.reset();

    this.data = this.originalData;
    this.originalData = cloneData(this.originalData);
    super.next(this.data);
  }

  public assignValues(target: any, source: any): void {
    Object.assign(target, source);
  }

  private reset() {
    this.data = [];
    this.updatedItems = [];
  }
}
