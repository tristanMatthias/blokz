import { Express, Handler, Request } from 'express';
import findRoot from 'find-root';
import stack from 'stack-trace';
import path from 'path';

import { Config } from '../config';
import { BrixContext } from '../config/types';
import {
  ErrorPluginNotAFunction,
  ErrorPluginRegistered,
  ErrorPluginsNotBuilt,
  ErrorPluginUnknown,
  ErrorRequiredPluginMissing,
} from '../errors';
import { logger } from '../lib/logger';
import { importLib } from '../lib/resolveFrom';
import { ClassType, ScalarsTypeMap } from './types';


export type MiddlewareFunction = (app: Express) => Handler | void | Promise<Handler | void>;
export type BrixContextMiddleware = (req: Request, context: Partial<BrixContext>) => Partial<BrixContext>;
export type BrixAuthChecker = (context: BrixContext, roles: string[]) => Promise<boolean> | boolean;


/**
 * Options for registering a plugin with Brix
 */
export interface BrixPluginOptions {
  /** Pretty name of the Brix plugin */
  name: string;
  /** Description of the Brix plugin */
  description?: string;
  /** List of other Brix plugins this plugin relies on */
  requires?: string[];
  // /** GQL Entities to register in Brix */
  // entities?: ClassType<any>[];
  /** GQL Scalars to register in Brix */
  scalars?: ScalarsTypeMap[];
  /** GQL Resolvers to register in Brix */
  resolvers?: ClassType<any>[];
  /** Express middlewares to register in Brix */
  middlewares?: MiddlewareFunction[];
  /** Apollo Context middleware to register in Brix */
  contextMiddlewares?: BrixContextMiddleware[];
  /** type-graphql Auth checker to register in Brix */
  authCheckers?: BrixAuthChecker[];
}
export interface BrixPluginSettings extends BrixPluginOptions {
  package: string;
}

export interface BrixPluginData {
  // /** Array of GQL Entities */
  // entities: ClassType<any>[];
  /** Array of GQL Scalars */
  scalars: ScalarsTypeMap[];
  /** Array of GQL Resolvers */
  resolvers: ClassType<any>[];
  /** Array of Express middlewares */
  middlewares: MiddlewareFunction[];
  /** Array of Apollo context middlewares */
  contextMiddlewares: BrixContextMiddleware[];
  /** type-graphql Auth checker to register in Brix */
  authCheckers: BrixAuthChecker[];
}

export type PluginPkg = (options?: any) => any;


/**
 * Brix plugin management
 */
export abstract class BrixPlugins {
  // /** Array of GQL Entities */
  // static get entities() {
  //   if (!this._buildData) throw new ErrorPluginsNotBuilt();
  //   return this._buildData.entities;
  // }
  /** Array of GQL Scalars */
  static get resolvers() {
    if (!this._buildData) throw new ErrorPluginsNotBuilt();
    return this._buildData.resolvers;
  }
  /** Array of GQL Resolvers */
  static get scalars() {
    if (!this._buildData) throw new ErrorPluginsNotBuilt();
    return this._buildData.scalars;
  }
  /** Array of Express middlewares */
  static get middlewares() {
    if (!this._buildData) throw new ErrorPluginsNotBuilt();
    return this._buildData.middlewares;
  }
  /** Array of Apollo context middlewares */
  static get contextMiddlewares() {
    if (!this._buildData) throw new ErrorPluginsNotBuilt();
    return this._buildData.contextMiddlewares;
  }
  /** Array of BrixAuthCheckers to use in `type-graphql` */
  static get authCheckers() {
    if (!this._buildData) throw new ErrorPluginsNotBuilt();
    return this._buildData.authCheckers;
  }
  private static _plugins: { [name: string]: BrixPluginSettings } = {};
  private static _buildData?: BrixPluginData;
  private static _building: null | Promise<BrixPluginData> = null;


  /**
  * Register a Brix plugin
  * @param options Options for the Brix plugin
  * @param overridePackage Use the `options.name` as the package registry
  * @example
  *  registerPlugin({
  *    name: 'cms',
  *    resolvers: [...],
  *    scalars: [{...}]
  *  })
  */
  static register(options: BrixPluginOptions, overridePackage = false) {
    const calledFrom = stack.get()[1].getFileName();
    const root = findRoot(calledFrom);
    let pkg: string;
    const pkgName = options.name.replace(/\s/g, '-').toLowerCase();
    if (overridePackage) pkg = pkgName;
    else pkg = require(`${root}/package.json`).name;
    if (!pkg) pkg = pkgName;

    if (this._plugins[pkg]) throw new ErrorPluginRegistered(options.name);
    else {
      this._plugins[pkg] = {
        package: pkg,
        ...options
      };
    }
  }

  /**
   * Perform checks on plugins and return all entities, resolvers, scalars, etc
   * generated by the plugin ecosystem
   */
  static async build() {
    if (this._buildData) return this._buildData;
    if (this._building) return this._building;

    return this._building = new Promise(async (res, rej) => {
      await Config.loadConfig();

      const attemptLoad = (pkg: string): Promise<false | PluginPkg> => new Promise(async res => {
        try {
          res(await importLib(pkg));
        } catch (e) {
          if (e.code === 'MODULE_NOT_FOUND') res(false);
          else throw e;
        }
      });

      if (Config.plugins) {
        try {
          await Promise.all(Object.entries(Config.plugins).map(async ([p, options]) => {
            let pkg;
            if (p.startsWith('./')) pkg = await attemptLoad(path.join(Config.rootDir, p));
            if (!pkg) pkg = await attemptLoad(`@brix/${p}`);
            if (!pkg) pkg = await attemptLoad(`@brix/plugin-${p}`);
            if (!pkg) pkg = await attemptLoad(`brix-plugin-${p}`);
            if (!pkg) pkg = await attemptLoad(p);
            if (!pkg) throw new ErrorPluginUnknown(p);
            if (typeof pkg !== 'function') throw new ErrorPluginNotAFunction(p);
            await (pkg as PluginPkg)(options);
            logger.info(`Loaded plugin ${p}`);
          }));
        } catch (e) {
          rej(e);
        }
      }

      try {
        await this._checkRequired();
      } catch (e) {
        return rej(e);
      }

      Object.keys(this._plugins).map(n => logger.info(`Loaded plugin ${n}`));

      this._buildData = {
        // entities: this._get('entities')!,
        resolvers: this._get('resolvers')!,
        scalars: this._get('scalars')!,
        middlewares: this._get('middlewares')!,
        contextMiddlewares: this._get('contextMiddlewares')!,
        authCheckers: this._get('authCheckers')!
      };
      res(this._buildData);
      this._building = null;
    });
  }

  static clear() {
    this._buildData = undefined;
    this._plugins = {};
  }

  /**
   * Loop over all plugins and check that the dependencies are installed
   */
  private static async _checkRequired() {
    return await Promise.all(Object.values(this._plugins).map(async p => {
      if (!p.requires) return;
      await Promise.all(
        p.requires.map(async required => {
          // TODO: Install required plugin automatically
          if (!this._plugins[required]) throw new ErrorRequiredPluginMissing(p.package, required);
        })
      );
    }));
  }

  /**
   * Combines a key from all plugins
   * @param from Key from each plugin to retrieve
   */
  private static _get<T extends keyof BrixPluginOptions>(from: T) {
    return Object.values(this._plugins).reduce((list, plugin) => {
      if (plugin[from]) return (list as any).concat(plugin[from]);
      return list;
    }, [] as unknown as BrixPluginOptions[T]);
  }
}


global.BrixPlugins = BrixPlugins;
