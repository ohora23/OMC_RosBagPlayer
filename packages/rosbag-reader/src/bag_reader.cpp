#include "bag_reader.h"
#include <fstream>
#include <algorithm>
#include <stdexcept>
#include <cstring>
#include <lz4.h>
#include <bzlib.h>

namespace rosbag_reader {

static uint32_t readUint32LE(const uint8_t* p) {
  return uint32_t(p[0]) | (uint32_t(p[1])<<8) | (uint32_t(p[2])<<16) | (uint32_t(p[3])<<24);
}

static uint64_t readUint64LE(const uint8_t* p) {
  uint64_t v = 0;
  for(int i=7;i>=0;i--) v = (v<<8)|p[i];
  return v;
}

static std::unordered_map<std::string,std::string> parseHeaderFields(const std::vector<uint8_t>& bytes) {
  std::unordered_map<std::string,std::string> fields;
  size_t i = 0;
  while(i < bytes.size()) {
    if(i+4 > bytes.size()) break;
    uint32_t field_len = readUint32LE(bytes.data()+i);
    i += 4;
    if(i+field_len > bytes.size()) break;
    size_t eq = bytes.size();
    for(size_t j=i;j<i+field_len;j++) {
      if(bytes[j]=='=') { eq=j; break; }
    }
    if(eq==bytes.size()) { i+=field_len; continue; }
    std::string key(bytes.begin()+i, bytes.begin()+eq);
    std::string val(bytes.begin()+eq+1, bytes.begin()+i+field_len);
    fields[key]=val;
    i+=field_len;
  }
  return fields;
}

static std::vector<uint8_t> decompressLZ4(const std::vector<uint8_t>& compressed, uint32_t uncompressed_size) {
  std::vector<uint8_t> out(uncompressed_size);
  int result = LZ4_decompress_safe(
    reinterpret_cast<const char*>(compressed.data()),
    reinterpret_cast<char*>(out.data()),
    static_cast<int>(compressed.size()),
    static_cast<int>(uncompressed_size)
  );
  if(result < 0) throw std::runtime_error("LZ4 decompression failed");
  out.resize(result);
  return out;
}

static std::vector<uint8_t> decompressBZ2(const std::vector<uint8_t>& compressed, uint32_t uncompressed_size) {
  std::vector<uint8_t> out(uncompressed_size * 2 + 1024);
  unsigned int dest_len = static_cast<unsigned int>(out.size());
  int result = BZ2_bzBuffToBuffDecompress(
    reinterpret_cast<char*>(out.data()),
    &dest_len,
    const_cast<char*>(reinterpret_cast<const char*>(compressed.data())),
    static_cast<unsigned int>(compressed.size()),
    0, 0
  );
  if(result != BZ_OK) throw std::runtime_error("BZ2 decompression failed");
  out.resize(dest_len);
  return out;
}

BagReader::BagReader(const std::string& path) {
  try {
    parseFile(path);
    open_ = true;
  } catch(const std::exception& e) {
    error_ = e.what();
    open_ = false;
  }
}

BagReader::~BagReader() {}

bool BagReader::isOpen() const { return open_; }
std::string BagReader::getError() const { return error_; }

uint32_t BagReader::readUint32LE(const uint8_t* p) {
  return ::rosbag_reader::readUint32LE(p);
}

uint64_t BagReader::readUint64LE(const uint8_t* p) {
  return ::rosbag_reader::readUint64LE(p);
}

std::unordered_map<std::string, std::string>
BagReader::parseHeaderFields(const std::vector<uint8_t>& bytes) {
  return ::rosbag_reader::parseHeaderFields(bytes);
}

void BagReader::parseFile(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if(!f.is_open()) throw std::runtime_error("Cannot open bag file: " + path);

  std::string sig;
  std::getline(f, sig);
  if(sig.find("#rosbag V2.0") == std::string::npos) {
    throw std::runtime_error("Not a ROS bag v2.0 file");
  }

  while(f.good() && !f.eof()) {
    uint32_t header_len = 0;
    f.read(reinterpret_cast<char*>(&header_len), 4);
    if(f.gcount() < 4) break;

    std::vector<uint8_t> header_bytes(header_len);
    f.read(reinterpret_cast<char*>(header_bytes.data()), header_len);
    if(f.gcount() < static_cast<std::streamsize>(header_len)) break;

    uint32_t data_len = 0;
    f.read(reinterpret_cast<char*>(&data_len), 4);
    if(f.gcount() < 4) break;

    std::vector<uint8_t> data_bytes(data_len);
    if(data_len > 0) {
      f.read(reinterpret_cast<char*>(data_bytes.data()), data_len);
    }

    auto fields = ::rosbag_reader::parseHeaderFields(header_bytes);
    if(fields.count("op") == 0 || fields["op"].empty()) continue;

    uint8_t op = static_cast<uint8_t>(fields["op"][0]);

    switch(op) {
      case 0x03:
        parseBagHeader(header_bytes);
        break;
      case 0x05:
        parseChunk(header_bytes, data_bytes);
        break;
      case 0x07:
        parseConnection(header_bytes, data_bytes);
        break;
      default:
        break;
    }
  }

  std::sort(messages_.begin(), messages_.end(),
    [](const StoredMessage& a, const StoredMessage& b) {
      return a.timestamp_ns < b.timestamp_ns;
    });
}

void BagReader::parseBagHeader(const std::vector<uint8_t>&) {
  // Nothing needed from bag header for basic iteration
}

void BagReader::parseChunk(const std::vector<uint8_t>& header_bytes,
                            const std::vector<uint8_t>& data_bytes) {
  auto fields = ::rosbag_reader::parseHeaderFields(header_bytes);
  std::string compression = fields.count("compression") ? fields["compression"] : "none";
  uint32_t uncompressed_size = 0;
  if(fields.count("size")) {
    const auto& sv = fields["size"];
    if(sv.size() >= 4) uncompressed_size = readUint32LE(reinterpret_cast<const uint8_t*>(sv.data()));
  }

  std::vector<uint8_t> chunk_data;
  if(compression == "lz4") {
    chunk_data = decompressLZ4(data_bytes, uncompressed_size);
  } else if(compression == "bz2") {
    chunk_data = decompressBZ2(data_bytes, uncompressed_size);
  } else {
    chunk_data = data_bytes;
  }

  size_t pos = 0;
  while(pos + 8 <= chunk_data.size()) {
    uint32_t h_len = readUint32LE(chunk_data.data() + pos);
    pos += 4;
    if(pos + h_len > chunk_data.size()) break;
    std::vector<uint8_t> h_bytes(chunk_data.begin()+pos, chunk_data.begin()+pos+h_len);
    pos += h_len;

    if(pos + 4 > chunk_data.size()) break;
    uint32_t d_len = readUint32LE(chunk_data.data() + pos);
    pos += 4;
    if(pos + d_len > chunk_data.size()) break;
    std::vector<uint8_t> d_bytes(chunk_data.begin()+pos, chunk_data.begin()+pos+d_len);
    pos += d_len;

    auto inner_fields = ::rosbag_reader::parseHeaderFields(h_bytes);
    if(inner_fields.count("op") == 0 || inner_fields["op"].empty()) continue;
    uint8_t op = static_cast<uint8_t>(inner_fields["op"][0]);

    if(op == 0x07) {
      parseConnection(h_bytes, d_bytes);
    } else if(op == 0x02) {
      if(!inner_fields.count("conn") || !inner_fields.count("time")) continue;
      const auto& conn_sv = inner_fields["conn"];
      const auto& time_sv = inner_fields["time"];
      if(conn_sv.size() < 4 || time_sv.size() < 8) continue;
      uint32_t conn_id = readUint32LE(reinterpret_cast<const uint8_t*>(conn_sv.data()));
      // ROS time is stored as (secs uint32, nsecs uint32) little-endian
      uint32_t secs  = readUint32LE(reinterpret_cast<const uint8_t*>(time_sv.data()));
      uint32_t nsecs = readUint32LE(reinterpret_cast<const uint8_t*>(time_sv.data()) + 4);
      uint64_t ts_ns = static_cast<uint64_t>(secs) * 1000000000ULL + nsecs;

      StoredMessage msg;
      msg.conn_id = conn_id;
      msg.timestamp_ns = ts_ns;
      msg.data = d_bytes;
      messages_.push_back(std::move(msg));
    }
  }
}

void BagReader::parseConnection(const std::vector<uint8_t>& header_bytes,
                                  const std::vector<uint8_t>& data_bytes) {
  auto h_fields = ::rosbag_reader::parseHeaderFields(header_bytes);
  uint32_t conn_id = 0;
  if(h_fields.count("conn")) {
    const auto& sv = h_fields["conn"];
    if(sv.size() >= 4) conn_id = readUint32LE(reinterpret_cast<const uint8_t*>(sv.data()));
  }
  std::string topic = h_fields.count("topic") ? h_fields["topic"] : "";

  auto d_fields = ::rosbag_reader::parseHeaderFields(data_bytes);

  ConnectionRecord rec;
  rec.conn_id = conn_id;
  rec.topic = topic;
  rec.msg_type = d_fields.count("type") ? d_fields["type"] : "";
  rec.md5sum = d_fields.count("md5sum") ? d_fields["md5sum"] : "";
  rec.message_definition = d_fields.count("message_definition") ? d_fields["message_definition"] : "";
  rec.callerid = d_fields.count("callerid") ? d_fields["callerid"] : "";

  if(!connections_by_id_.count(conn_id)) {
    connections_by_id_[conn_id] = rec;
    topic_to_conn_id_[topic] = conn_id;
  }
}

std::vector<TopicInfo> BagReader::getTopics() const {
  std::unordered_map<uint32_t, uint32_t> counts;
  uint64_t min_ts = UINT64_MAX, max_ts = 0;
  for(const auto& msg : messages_) {
    counts[msg.conn_id]++;
    if(msg.timestamp_ns < min_ts) min_ts = msg.timestamp_ns;
    if(msg.timestamp_ns > max_ts) max_ts = msg.timestamp_ns;
  }
  double duration_s = (max_ts > min_ts) ? static_cast<double>(max_ts - min_ts) / 1e9 : 1.0;

  std::vector<TopicInfo> result;
  for(const auto& [id, rec] : connections_by_id_) {
    TopicInfo ti;
    ti.topic = rec.topic;
    ti.msg_type = rec.msg_type;
    ti.message_count = counts.count(id) ? counts.at(id) : 0;
    ti.frequency = (duration_s > 0 && ti.message_count > 1) ? (ti.message_count - 1) / duration_s : 0.0;
    result.push_back(ti);
  }
  return result;
}

std::vector<ConnectionRecord> BagReader::getConnections() const {
  std::vector<ConnectionRecord> result;
  for(const auto& [id, rec] : connections_by_id_) {
    result.push_back(rec);
  }
  return result;
}

int BagReader::createIterator(const std::vector<std::string>& topics,
                               uint64_t start_ns, uint64_t end_ns) {
  IteratorState state;
  state.topics = topics;
  state.start_ns = start_ns;
  state.end_ns = end_ns;
  state.index = 0;

  if(start_ns > 0) {
    for(size_t i=0;i<messages_.size();i++) {
      if(messages_[i].timestamp_ns >= start_ns) {
        state.index = i;
        break;
      }
    }
  }

  int id = next_iterator_id_++;
  iterators_[id] = std::move(state);
  return id;
}

std::unique_ptr<RawMessage> BagReader::nextMessage(int iterator_id) {
  auto it = iterators_.find(iterator_id);
  if(it == iterators_.end()) return nullptr;

  auto& state = it->second;

  while(state.index < messages_.size()) {
    const auto& msg = messages_[state.index];
    state.index++;

    if(msg.timestamp_ns > state.end_ns) return nullptr;

    if(!state.topics.empty()) {
      auto conn_it = connections_by_id_.find(msg.conn_id);
      if(conn_it == connections_by_id_.end()) continue;
      const std::string& topic = conn_it->second.topic;
      bool match = false;
      for(const auto& t : state.topics) {
        if(t == topic) { match = true; break; }
      }
      if(!match) continue;
    }

    auto result = std::make_unique<RawMessage>();
    auto conn_it = connections_by_id_.find(msg.conn_id);
    result->topic = (conn_it != connections_by_id_.end()) ? conn_it->second.topic : "";
    result->timestamp_ns = msg.timestamp_ns;
    result->data = msg.data;
    return result;
  }
  return nullptr;
}

void BagReader::closeIterator(int iterator_id) {
  iterators_.erase(iterator_id);
}

} // namespace rosbag_reader
