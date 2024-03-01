import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RestAPI } from '../models/rest-api.model';
import { saveAs } from 'file-saver';


@Injectable({
  providedIn: 'root',
})
export class SchemaService {
  constructor(private http: HttpClient) {}

  private URL: string = 'http://localhost:3000/api';

  tableQuery(database: string): Observable<any> {
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        returnFormatVersion: '2',
      }),
    };

    return this.http.get<any[]>(
      `${this.URL}/schema?dbName=${database}`,
      httpOptions
    );
  }

  generate(body: RestAPI): void {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const options = { headers, responseType: 'blob' as 'json' };

    this.http.post(`${this.URL}/generate`, body, options).subscribe(
      (response: any) => {
        const filename = 'api_gerada.zip';
        saveAs(response, filename);
      },
      (error: any) => {
        console.error('Error downloading file:', error);
      }
    );
  }
}
