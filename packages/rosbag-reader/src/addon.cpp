#include <napi.h>
#include "bag_reader.h"
#include <memory>
#include <unordered_map>
#include <atomic>

using namespace rosbag_reader;

static std::unordered_map<uint32_t, std::unique_ptr<BagReader>> g_bags;
static std::atomic<uint32_t> g_bag_id_counter{1};

Napi::Value OpenBag(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if(info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "openBag(filePath: string)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();
  auto reader = std::make_unique<BagReader>(path);
  if(!reader->isOpen()) {
    Napi::Error::New(env, "Failed to open bag: " + reader->getError()).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  uint32_t id = g_bag_id_counter.fetch_add(1);
  g_bags[id] = std::move(reader);
  return Napi::Number::New(env, id);
}

Napi::Value GetTopics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if(info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "getTopics(handle: number)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  uint32_t id = info[0].As<Napi::Number>().Uint32Value();
  auto it = g_bags.find(id);
  if(it == g_bags.end()) {
    Napi::Error::New(env, "Invalid bag handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto topics = it->second->getTopics();
  Napi::Array arr = Napi::Array::New(env, topics.size());
  for(size_t i=0;i<topics.size();i++) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("topic", topics[i].topic);
    obj.Set("type", topics[i].msg_type);
    obj.Set("messageCount", Napi::Number::New(env, topics[i].message_count));
    obj.Set("frequency", Napi::Number::New(env, topics[i].frequency));
    arr[i] = obj;
  }
  return arr;
}

Napi::Value GetConnections(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if(info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "getConnections(handle: number)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  uint32_t id = info[0].As<Napi::Number>().Uint32Value();
  auto it = g_bags.find(id);
  if(it == g_bags.end()) {
    Napi::Error::New(env, "Invalid bag handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto conns = it->second->getConnections();
  Napi::Array arr = Napi::Array::New(env, conns.size());
  for(size_t i=0;i<conns.size();i++) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("topic", conns[i].topic);
    obj.Set("type", conns[i].msg_type);
    obj.Set("md5sum", conns[i].md5sum);
    obj.Set("messageDefinition", conns[i].message_definition);
    obj.Set("callerid", conns[i].callerid);
    arr[i] = obj;
  }
  return arr;
}

Napi::Value CreateIterator(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if(info.Length() < 2 || !info[0].IsNumber() || !info[1].IsArray()) {
    Napi::TypeError::New(env, "createIterator(handle, topics[])").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  uint32_t bag_id = info[0].As<Napi::Number>().Uint32Value();
  auto bag_it = g_bags.find(bag_id);
  if(bag_it == g_bags.end()) {
    Napi::Error::New(env, "Invalid bag handle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Array topics_arr = info[1].As<Napi::Array>();
  std::vector<std::string> topics;
  for(uint32_t i=0;i<topics_arr.Length();i++) {
    topics.push_back(topics_arr.Get(i).As<Napi::String>().Utf8Value());
  }

  uint64_t start_ns = 0, end_ns = UINT64_MAX;
  if(info.Length() >= 3 && info[2].IsNumber()) start_ns = static_cast<uint64_t>(info[2].As<Napi::Number>().Int64Value());
  if(info.Length() >= 4 && info[3].IsNumber()) end_ns = static_cast<uint64_t>(info[3].As<Napi::Number>().Int64Value());

  int iter_id = bag_it->second->createIterator(topics, start_ns, end_ns);

  // Encode (bag_id << 16 | iter_id) as the handle (assuming iter_id < 65536)
  uint32_t handle = (bag_id << 16) | (static_cast<uint32_t>(iter_id) & 0xFFFF);
  return Napi::Number::New(env, handle);
}

Napi::Value NextMessage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if(info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "nextMessage(iteratorHandle)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  uint32_t handle = info[0].As<Napi::Number>().Uint32Value();
  uint32_t bag_id = handle >> 16;
  int iter_id = static_cast<int>(handle & 0xFFFF);

  auto bag_it = g_bags.find(bag_id);
  if(bag_it == g_bags.end()) return env.Null();

  auto msg = bag_it->second->nextMessage(iter_id);
  if(!msg) return env.Null();

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("topic", msg->topic);
  obj.Set("timestamp", Napi::Number::New(env, static_cast<double>(msg->timestamp_ns)));
  auto buf = Napi::Buffer<uint8_t>::Copy(env, msg->data.data(), msg->data.size());
  obj.Set("data", buf);
  return obj;
}

Napi::Value CloseBag(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if(info.Length() < 1 || !info[0].IsNumber()) return env.Undefined();
  uint32_t id = info[0].As<Napi::Number>().Uint32Value();
  g_bags.erase(id);
  return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("openBag", Napi::Function::New(env, OpenBag));
  exports.Set("getTopics", Napi::Function::New(env, GetTopics));
  exports.Set("getConnections", Napi::Function::New(env, GetConnections));
  exports.Set("createIterator", Napi::Function::New(env, CreateIterator));
  exports.Set("nextMessage", Napi::Function::New(env, NextMessage));
  exports.Set("closeBag", Napi::Function::New(env, CloseBag));
  return exports;
}

NODE_API_MODULE(rosbag_reader, Init)
