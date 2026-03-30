#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <cstdint>

namespace rosbag_reader {

struct ConnectionRecord {
  uint32_t conn_id;
  std::string topic;
  std::string msg_type;
  std::string md5sum;
  std::string message_definition;
  std::string callerid;
};

struct TopicInfo {
  std::string topic;
  std::string msg_type;
  uint32_t message_count;
  double frequency;
};

struct RawMessage {
  std::string topic;
  uint64_t timestamp_ns;  // nanoseconds since epoch
  std::vector<uint8_t> data;
};

class BagReader {
public:
  explicit BagReader(const std::string& path);
  ~BagReader();

  bool isOpen() const;
  std::string getError() const;

  std::vector<TopicInfo> getTopics() const;
  std::vector<ConnectionRecord> getConnections() const;

  // Create a new iterator for the given topics and optional time range.
  // Returns iterator id, or -1 on error.
  int createIterator(const std::vector<std::string>& topics,
                     uint64_t start_ns = 0,
                     uint64_t end_ns = UINT64_MAX);

  // Get next message from iterator. Returns nullptr when exhausted.
  std::unique_ptr<RawMessage> nextMessage(int iterator_id);

  void closeIterator(int iterator_id);

private:
  void parseFile(const std::string& path);
  void parseBagHeader(const std::vector<uint8_t>& header_bytes);
  void parseChunk(const std::vector<uint8_t>& header_bytes,
                  const std::vector<uint8_t>& data_bytes);
  void parseConnection(const std::vector<uint8_t>& header_bytes,
                       const std::vector<uint8_t>& data_bytes);

  static std::unordered_map<std::string, std::string>
  parseHeaderFields(const std::vector<uint8_t>& bytes);

  static uint32_t readUint32LE(const uint8_t* ptr);
  static uint64_t readUint64LE(const uint8_t* ptr);

  bool open_ = false;
  std::string error_;

  std::unordered_map<uint32_t, ConnectionRecord> connections_by_id_;
  std::unordered_map<std::string, uint32_t> topic_to_conn_id_;

  // All messages loaded from chunks
  struct StoredMessage {
    uint32_t conn_id;
    uint64_t timestamp_ns;
    std::vector<uint8_t> data;
  };
  std::vector<StoredMessage> messages_;  // sorted by timestamp

  // Iterators: map from iterator_id to current index
  struct IteratorState {
    std::vector<std::string> topics;
    uint64_t start_ns;
    uint64_t end_ns;
    size_t index;  // current position in messages_
  };
  std::unordered_map<int, IteratorState> iterators_;
  int next_iterator_id_ = 0;
};

} // namespace rosbag_reader
