# PDU.ts
Protocol Data Unit 🦂 Implementation for TypeScript ❄️


## Install
1. `yarn add pdu.ts`
or
1. `npm i pdu.ts`


## Usage

```TypeScript
import { PDUParser } from 'pdu.ts';
```


## API

```TypeScript

type pduMessage = {
    smsc: string;
    smsc_type: number;
    receiver: string;
    receiver_type: number;
    encoding: "16bit" | "8bit" | "7bit";
    text: string;
    request_status: boolean;
};

Generate(message: pduMessage): Array<string>;
Parse(pdu: string)
detectEncoding(dataCodingScheme: string | number): "7bit" | "8bit" | "16bit";
decode16Bit(data: string, length: number): string;
decode7Bit(code: string, length: number, unPadding?: any): string;
encode7Bit(inTextNumberArray: Array<number>, paddingBits?: number): string;
encode16Bit(inTextNumberArray: Array<number>): string;
messageToNumberArray(message: any): any[];
parseStatusReport(pdu: string, smsc_parsed: any): any;
deSwapNibbles(nibbles: any): string;
swapNibbles(nibbles: any): string;
parseSMSCPart(pdu: string): any;
parseTS(ts: any): Date;
TP_MTI_To_String(tp_mti: "00" | "01" | "10"): "unknown" | "SMS-DELIVER" | "SMS-SUBMIT" | "SMS-STATUS-REPORT";
randomHexa(size: number): string;
octetLength(str: string): string;
ussdEncode(ussd: string): string;

```
