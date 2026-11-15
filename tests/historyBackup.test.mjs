import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeHistoryBackup, parseHistoryBackup, mergeHistoryBackup } from '../src/services/historyBackup.ts';

const history = {
  conversations: [{id:'people:TuyetMinh',name:'TuyetMinh',initial:'T',color:'#fff',preview:'hello',time:'12:00',unread:0}],
  messages: {'people:TuyetMinh':[
    {id:'local:abc',fromMe:true,text:'Chào',time:'12:00',clientSentAt:1700000000000},
    {id:'55',fromMe:false,text:'Hi',time:'12:01',createdAt:'2026-11-15T05:01:00.000Z'},
  ]},
};

test('Xuất chỉ chứa lịch sử theo tài khoản, không chứa token hay mật khẩu',()=>{
  const json=serializeHistoryBackup('TuanAnh',history);
  const parsed=JSON.parse(json);
  assert.equal(parsed.username,'TuanAnh');
  assert.equal(parsed.format,'lyra-local-history');
  assert.equal(parsed.messages['people:TuyetMinh'].length,2);
  assert.equal(json.includes('RE_LOGIN_CODE'),false);
});

test('Nhập lịch sử chỉ cho đúng tài khoản và đánh dấu chưa xác minh trên server',()=>{
  const json=serializeHistoryBackup('TuanAnh',history);
  const backup=parseHistoryBackup(json,'TuanAnh');
  assert.deepEqual(backup.messages['people:TuyetMinh'].map(m=>m.id),['unverified:backup:local:abc','unverified:backup:55']);
  assert.throws(()=>parseHistoryBackup(json,'TuyetMinh'),/tài khoản khác/);
});

test('Nhập hai lần không nhân đôi, đồng thời không xoá dữ liệu đang có',()=>{
  const imported=parseHistoryBackup(serializeHistoryBackup('TuanAnh',history),'TuanAnh');
  const merged=mergeHistoryBackup({conversations:[],messages:{}},imported);
  const again=mergeHistoryBackup(merged,imported);
  assert.equal(again.messages['people:TuyetMinh'].length,2);
  const sameOrigin=mergeHistoryBackup(history, imported);
  assert.equal(sameOrigin.messages['people:TuyetMinh'].length,2);
  const afterRefresh = {...history, messages: {'people:TuyetMinh': [{...history.messages['people:TuyetMinh'][0], id:'unverified:abc'}]}};
  assert.equal(mergeHistoryBackup(afterRefresh, imported).messages['people:TuyetMinh'].length,2);
});

test('Từ chối file không hợp lệ, và lọc hội thoại ngoài phạm vi',()=>{
  assert.throws(()=>parseHistoryBackup('not-json','TuanAnh'),/JSON/);
  assert.throws(()=>parseHistoryBackup('{}','TuanAnh'),/LyraChat/);
  const forged=JSON.stringify({format:'lyra-local-history',version:1,username:'TuanAnh',conversations:[],messages:{'__proto__':[], 'people:Test':[{id:'x',fromMe:true,text:'ok',time:''}]}});
  const imported=parseHistoryBackup(forged,'TuanAnh');
  assert.equal(imported.messages['people:Test']?.length,1);
  assert.equal(Object.hasOwn(imported.messages,'__proto__'),false);
});
