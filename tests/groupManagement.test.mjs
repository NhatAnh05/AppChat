import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sameGroupName,
  makeGroupContact,
  normalizeGroupSearch,
  filterAndSortGroups,
  makeGroupShareText,
  readableGroupError,
} from '../src/services/groupManagement.ts';

const entries = [
  { id: 'Team B', name: 'Team B', initials: 'TE', color: '#123' },
  { id: 'Nhóm học tập', name: 'Nhóm học tập', initials: 'NH', color: '#456' },
  { id: 'An', name: 'An', initials: 'AN', color: '#789' },
];

test('So sánh tên nhóm không phân biệt khoảng trắng và chữ hoa/thường', () => {
  assert.equal(sameGroupName('  NHÓM A  ', 'nhóm a'), true);
  assert.equal(sameGroupName('Nhóm A', 'Nhóm B'), false);
});

test('Chuyển phòng đã xác nhận thành liên hệ nhóm có đúng ID, avatar và màu', () => {
  assert.deepEqual(makeGroupContact({ name: '  Team A  ' }), {
    id: 'Team A', name: 'Team A', initials: 'TE', color: '#428d83', detail: 'Nhóm trò chuyện',
  });
});

test('Tìm nhóm theo tiếng Việt không dấu và chữ Đ', () => {
  assert.equal(normalizeGroupSearch('  Đồ Án '), 'do an');
  assert.equal(normalizeGroupSearch('NHÓM HỌC TẬP'), 'nhom hoc tap');
});

test('Lọc nhóm không dấu, không sửa danh sách Redux', () => {
  const original = entries.map(item => item.name);
  assert.deepEqual(filterAndSortGroups(entries, 'nhom hoc').map(item => item.id), ['Nhóm học tập']);
  assert.deepEqual(entries.map(item => item.name), original);
});

test('Sắp xếp A-Z và Z-A đúng chiều', () => {
  const forward = filterAndSortGroups(entries, '');
  const reverse = filterAndSortGroups(entries, '', false);
  assert.deepEqual(forward.map(item => item.id), [...reverse].reverse().map(item => item.id));
});

test('Hướng dẫn chia sẻ không tạo liên kết tham gia ảo', () => {
  const shareText = makeGroupShareText('  Team A  ');
  assert.match(shareText, /Team A/);
  assert.match(shareText, /Tham gia nhóm/);
  assert.doesNotMatch(shareText, /http/i);
});

test('Thông báo lỗi tạo nhóm trùng tên dễ hiểu', () => {
  assert.match(readableGroupError(new Error('Room Exist or Error')), /đã tồn tại/);
});

test('Thông báo lỗi nhóm không tồn tại dễ hiểu', () => {
  assert.match(readableGroupError(new Error('Room not found')), /Không tìm thấy nhóm/);
});

test('Thông báo lỗi chủ phòng bị từ chối rời nhóm', () => {
  assert.match(readableGroupError(new Error('room owner')), /chủ phòng/);
});

test('Thông báo lỗi chưa phải thành viên', () => {
  assert.match(readableGroupError(new Error('You are not in this room!')), /chưa là thành viên/);
});

test('Giữ nguyên lỗi chưa được định nghĩa thay vì báo thành công', () => {
  assert.equal(readableGroupError(new Error('Backend offline')), 'Backend offline');
});
