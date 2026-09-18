import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class _DocumentsApi extends ApiClient {
  _DocumentsApi():super(baseUrl:'http://127.0.0.1:3000',accessToken:'test');
  final paths=<String>[];

  @override
  Future<dynamic> get(String path) async {
    paths.add(path);
    if(path=='/api/v1/documents/published'){
      return [{'id':'doc-1','title':'Parking policy','version':2,'audience':'ALL_MEMBERS'}];
    }
    if(path=='/api/v1/documents/published/doc-1/download-intent'){
      return {'downloadUrl':'https://example.invalid/secure-document'};
    }
    throw ApiException(404,'Not found');
  }
}

void main(){
  test('resident repository uses authorized society document endpoints',() async{
    final api=_DocumentsApi();
    final repository=ResidentRepository(api);

    final docs=await repository.societyDocuments();
    final intent=await repository.societyDocumentDownloadIntent('doc-1');

    expect(docs.single['id'],'doc-1');
    expect(intent['downloadUrl'],'https://example.invalid/secure-document');
    expect(api.paths,[
      '/api/v1/documents/published',
      '/api/v1/documents/published/doc-1/download-intent',
    ]);
  });
}
