import { describe, expect, it } from 'vitest';
import { residentIntentRoutingText } from './ai-assistant.service';

describe('V4.54 multilingual resident staff intent routing',()=>{
  it('maps Hindi household staff language to the workforce intent vocabulary',()=>{
    expect(residentIntentRoutingText('मेरी कामवाली आज आई है?')).toContain('household staff domestic help worker workforce');
  });
  it('maps Tamil household staff language to the workforce intent vocabulary',()=>{
    expect(residentIntentRoutingText('வீட்டு பணியாளர் இன்று வந்தாரா?')).toContain('household staff domestic help worker workforce');
  });
});
