export interface FieldDefinition {
  name: string;
  type: string;
  isArray: boolean;
  arrayLength: number | null; // null = variable, N = fixed
  isComplex: boolean;
}

export interface MessageDefinition {
  name: string;
  fields: FieldDefinition[];
  subDefs: Map<string, MessageDefinition>;
}

export interface PointCloud2Fields {
  header: { seq: number; stampSecs: number; stampNsecs: number; frameId: string };
  height: number;
  width: number;
  fields: Array<{ name: string; offset: number; datatype: number; count: number }>;
  isBigendian: boolean;
  pointStep: number;
  rowStep: number;
  data: Uint8Array;
  isDense: boolean;
}

export interface ImageFields {
  header: { seq: number; stampSecs: number; stampNsecs: number; frameId: string };
  height: number;
  width: number;
  encoding: string;
  isBigendian: number;
  step: number;
  data: Uint8Array;
}

export interface LaserScanFields {
  header: { seq: number; stampSecs: number; stampNsecs: number; frameId: string };
  angleMin: number;
  angleMax: number;
  angleIncrement: number;
  timeIncrement: number;
  scanTime: number;
  rangeMin: number;
  rangeMax: number;
  ranges: Float32Array;
  intensities: Float32Array;
}

export interface OdometryFields {
  header: { seq: number; stampSecs: number; stampNsecs: number; frameId: string };
  childFrameId: string;
  pose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
    covariance: Float64Array;
  };
  twist: {
    linear: { x: number; y: number; z: number };
    angular: { x: number; y: number; z: number };
    covariance: Float64Array;
  };
}
