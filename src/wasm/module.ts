import { WasmEncoder } from "./encoder";
import { TYPE, type WasmValType } from "./opcodes";
import { OP } from "./opcodes";
import type { IRNode } from "./ir";
import { emitIR } from "./codegen";

export interface FuncDef {
  params: WasmValType[];
  results: WasmValType[];
  locals?: WasmValType[];
  body: IRNode[];
}

export interface ImportDef {
  module: string;
  name: string;
  params: WasmValType[];
  results: WasmValType[];
}

export interface ExportDef {
  name: string;
  idx: number;
}

export interface GlobalDef {
  type: WasmValType;
  mutable: boolean;
  init: number;
}

export interface DataSegment {
  offset: number;
  init: Uint8Array;
}

export interface TableDef {
  min: number;
  max?: number;
}

export interface ElementDef {
  tableIdx: number;
  offset: number;
  funcIndices: number[];
}

export interface ModuleOptions {
  imports?: ImportDef[];
  memoryPages?: number;
  exports?: ExportDef[];
  globals?: GlobalDef[];
  dataSegments?: DataSegment[];
  tables?: TableDef[];
  elements?: ElementDef[];
}

export function buildModule(
  funcs: FuncDef[],
  { imports = [], memoryPages = 1, exports: moduleExports = [], globals = [], dataSegments = [], tables = [], elements = [] }: ModuleOptions = {},
): Uint8Array {
  const enc = new WasmEncoder();
  // Magic + version
  enc.raw([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

  // Collect all function types (imports + funcs)
  const allTypes: { params: WasmValType[]; results: WasmValType[] }[] = [];
  const typeMap = new Map<string, number>();
  function getTypeIdx(params: WasmValType[], results: WasmValType[]): number {
    const key = JSON.stringify([params, results]);
    if (typeMap.has(key)) return typeMap.get(key)!;
    const idx = allTypes.length;
    allTypes.push({ params, results });
    typeMap.set(key, idx);
    return idx;
  }

  // Register types
  imports.forEach((im) => getTypeIdx(im.params, im.results));
  funcs.forEach((f) => getTypeIdx(f.params, f.results));

  // Type section
  enc.section(1, (s) => {
    s.u32(allTypes.length);
    allTypes.forEach((t) => {
      s.byte(0x60);
      s.u32(t.params.length);
      t.params.forEach((p) => s.byte(TYPE[p]));
      s.u32(t.results.length);
      t.results.forEach((r) => s.byte(TYPE[r]));
    });
  });

  // Import section
  if (imports.length) {
    enc.section(2, (s) => {
      s.u32(imports.length);
      imports.forEach((im) => {
        const modBytes = new TextEncoder().encode(im.module);
        s.u32(modBytes.length);
        s.raw([...modBytes]);
        const nameBytes = new TextEncoder().encode(im.name);
        s.u32(nameBytes.length);
        s.raw([...nameBytes]);
        s.byte(0x00); // func import
        s.u32(getTypeIdx(im.params, im.results));
      });
    });
  }

  // Function section
  enc.section(3, (s) => {
    s.u32(funcs.length);
    funcs.forEach((f) => s.u32(getTypeIdx(f.params, f.results)));
  });

  // Table section (section 4)
  if (tables.length) {
    enc.section(4, (s) => {
      s.u32(tables.length);
      tables.forEach((t) => {
        s.byte(0x70); // funcref
        if (t.max != null) {
          s.byte(0x01); // has max
          s.u32(t.min);
          s.u32(t.max);
        } else {
          s.byte(0x00); // no max
          s.u32(t.min);
        }
      });
    });
  }

  // Memory section
  enc.section(5, (s) => {
    s.u32(1);
    s.byte(0x00);
    s.u32(memoryPages);
  });

  // Global section
  if (globals.length) {
    enc.section(6, (s) => {
      s.u32(globals.length);
      globals.forEach((g) => {
        s.byte(TYPE[g.type]);
        s.byte(g.mutable ? 0x01 : 0x00);
        // Init expression
        switch (g.type) {
          case "i32": s.byte(OP.i32_const); s.i32(g.init); break;
          case "i64": s.byte(OP.i64_const); s.i64(g.init); break;
          case "f32": s.byte(OP.f32_const); s.f32(g.init); break;
          case "f64": s.byte(OP.f64_const); s.f64(g.init); break;
        }
        s.byte(OP.end);
      });
    });
  }

  // Export section
  enc.section(7, (s) => {
    const allExports = [
      { name: "memory", kind: 0x02, idx: 0 },
      ...moduleExports.map((e) => ({ name: e.name, kind: 0x00, idx: e.idx })),
    ];
    s.u32(allExports.length);
    allExports.forEach((e) => {
      const nameBytes = new TextEncoder().encode(e.name);
      s.u32(nameBytes.length);
      s.raw([...nameBytes]);
      s.byte(e.kind);
      s.u32(e.idx);
    });
  });

  // Element section (section 9)
  if (elements.length) {
    enc.section(9, (s) => {
      s.u32(elements.length);
      elements.forEach((el) => {
        s.byte(0x00); // active, table 0
        // offset init expression
        s.byte(OP.i32_const);
        s.i32(el.offset);
        s.byte(OP.end);
        // func indices
        s.u32(el.funcIndices.length);
        el.funcIndices.forEach((idx) => s.u32(idx));
      });
    });
  }

  // Code section
  enc.section(10, (s) => {
    s.u32(funcs.length);
    funcs.forEach((f) => {
      const bodyEnc = new WasmEncoder();
      // Locals (grouped by type)
      const localGroups: { count: number; type: WasmValType }[] = [];
      if (f.locals && f.locals.length) {
        let cur = f.locals[0]!;
        let count = 1;
        for (let i = 1; i < f.locals.length; i++) {
          if (f.locals[i] === cur) count++;
          else {
            localGroups.push({ count, type: cur });
            cur = f.locals[i]!;
            count = 1;
          }
        }
        localGroups.push({ count, type: cur });
      }
      bodyEnc.u32(localGroups.length);
      localGroups.forEach((g) => {
        bodyEnc.u32(g.count);
        bodyEnc.byte(TYPE[g.type]);
      });
      // Body IR
      f.body.forEach((node) => emitIR(bodyEnc, node));
      bodyEnc.byte(OP.end);
      s.u32(bodyEnc.bytes.length);
      s.raw(bodyEnc.bytes);
    });
  });

  // Data section (section 11)
  if (dataSegments.length) {
    enc.section(11, (s) => {
      s.u32(dataSegments.length);
      dataSegments.forEach((seg) => {
        s.byte(0x00); // active segment, memory 0
        s.byte(OP.i32_const);
        s.i32(seg.offset);
        s.byte(OP.end);
        s.u32(seg.init.length);
        s.raw([...seg.init]);
      });
    });
  }

  return enc.toBuffer();
}
