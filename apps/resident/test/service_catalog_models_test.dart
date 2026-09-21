import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/models/service_catalog_models.dart';

void main(){
  test('parses service catalogue API boundary into typed offering',(){
    final model=ServiceOfferingSummary.tryParse({
      'id':'offering-1','categoryId':'category-1','name':'AC service','pricePaise':149900,'durationMinutes':60,
      'description':'Annual service',
      'provider':{'businessName':'CoolCare','ratingAverage':4.7,'ratingCount':31,'completedJobs':128},
      'category':{'id':'category-1','name':'Appliance care'},
    });
    expect(model,isNotNull);
    expect(model!.provider.businessName,'CoolCare');
    expect(model.pricePaise,149900);
    expect(model.searchText,contains('appliance care'));
  });

  test('rejects incomplete catalogue boundary rows',(){
    expect(ServiceOfferingSummary.tryParse({'id':'missing-provider','categoryId':'c','name':'Test'}),isNull);
  });
}
