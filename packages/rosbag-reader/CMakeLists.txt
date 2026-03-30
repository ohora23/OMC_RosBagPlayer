cmake_minimum_required(VERSION 3.15)
project(rosbag_reader CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find LZ4
find_package(PkgConfig QUIET)
if(PkgConfig_FOUND)
  pkg_check_modules(LZ4 QUIET liblz4)
endif()
if(NOT LZ4_FOUND)
  find_path(LZ4_INCLUDE_DIR lz4.h)
  find_library(LZ4_LIBRARIES NAMES lz4)
  if(LZ4_INCLUDE_DIR AND LZ4_LIBRARIES)
    set(LZ4_FOUND TRUE)
    set(LZ4_INCLUDE_DIRS ${LZ4_INCLUDE_DIR})
  endif()
endif()
if(NOT LZ4_FOUND)
  message(FATAL_ERROR "liblz4 not found. Install with: apt-get install liblz4-dev")
endif()

# Find BZ2
find_package(BZip2 REQUIRED)

# Node addon API include path
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

# Source files
add_library(${PROJECT_NAME} SHARED
  src/addon.cpp
  src/bag_reader.cpp
  ${CMAKE_JS_SRC}
)

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
  ${CMAKE_JS_INC}
  ${NODE_ADDON_API_DIR}
  ${LZ4_INCLUDE_DIRS}
  ${BZIP2_INCLUDE_DIRS}
  src/
)

# Compile definitions
target_compile_definitions(${PROJECT_NAME} PRIVATE
  NAPI_VERSION=8
  NAPI_DISABLE_CPP_EXCEPTIONS
)

# Output settings
set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

# Link
target_link_libraries(${PROJECT_NAME}
  ${CMAKE_JS_LIB}
  ${LZ4_LIBRARIES}
  ${BZIP2_LIBRARIES}
)
