export namespace main {
	
	export class SSHState {
	    status: string;
	    user: string;
	    host: string;
	    port: number;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.user = source["user"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.error = source["error"];
	    }
	}

}

export namespace store {
	
	export class Origin {
	    file: string;
	    line: number;
	    function: string;
	
	    static createFrom(source: any = {}) {
	        return new Origin(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.line = source["line"];
	        this.function = source["function"];
	    }
	}
	export class Payload {
	    id: string;
	    requestId?: string;
	    type: string;
	    label: string;
	    color?: string;
	    content: string;
	    origin?: Origin;
	    project?: string;
	    // Go type: time
	    timestamp: any;
	
	    static createFrom(source: any = {}) {
	        return new Payload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.requestId = source["requestId"];
	        this.type = source["type"];
	        this.label = source["label"];
	        this.color = source["color"];
	        this.content = source["content"];
	        this.origin = this.convertValues(source["origin"], Origin);
	        this.project = source["project"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

