import { sevenBitEsc, sevenBitDefault } from "./bit";

export class PDUParser
{
    public static Parse(pdu: string)
    {
        var cursor = 0;

        var obj = this.parseSMSCPart (pdu);
        obj.smsc_tpdu = pdu;
        cursor += obj.length;

        var buffer = new Buffer(pdu.slice(cursor,cursor+6), 'hex');
        cursor += 6;
        var smsDeliver = parseInt(<any>buffer[0]);

        var smsDeliverBits = ("00000000"+parseInt(<any>smsDeliver).toString(2)).slice(-8);
        var tp_mti = smsDeliverBits.slice(-2);
        obj.tpdu_type = this.TP_MTI_To_String (<any>tp_mti);

        if (tp_mti=='10'){ //SMS-STATUS-REPORT
            return this.parseStatusReport (pdu.slice(cursor-6), obj);
        }
        var udhi =  smsDeliverBits.slice(1,2) === "1";

        var senderSize = buffer[1];
        if(senderSize % 2 === 1)
            senderSize++;

        obj.sender_type = parseInt(<any>buffer[2]).toString(16);
        if (obj.sender_type === 'd0') {
            obj.sender = this.decode7Bit(pdu.slice(cursor, cursor+senderSize), Math.floor(senderSize*4/7)).trim();
        } else {
            obj.sender = this.deSwapNibbles(pdu.slice(cursor, cursor+senderSize));
        }
        cursor += senderSize;

        var protocolIdentifier = pdu.slice(cursor, cursor+2);
        cursor += 2;

        var dataCodingScheme = pdu.slice(cursor, cursor+2);
        cursor = cursor+2;

        obj.dcs = parseInt(dataCodingScheme, 16);
        obj.encoding = this.detectEncoding(dataCodingScheme);


        obj.time = this.parseTS (pdu.slice(cursor, cursor+14));

        cursor += 14;

        var dataLength = <any>parseInt(pdu.slice(cursor, cursor+2), 16).toString(10);
        cursor += 2;

        if(udhi) { //User-Data-Header-Indicator: means there's some User-Data-Header.
            var udhLength = pdu.slice(cursor, cursor+2);
            var iei = pdu.slice(cursor+2, cursor+4);
            var headerLength, referenceNumber, parts, currentPart;
            if(iei == "00") { //Concatenated sms.
                headerLength = pdu.slice(cursor+4, cursor+6);
                referenceNumber = pdu.slice(cursor+6, cursor+8);
                parts = pdu.slice(cursor+8, cursor+10);
                currentPart = pdu.slice(cursor+10, cursor+12);
            }

            if(iei == "08") { //Concatenaded sms with a two-bytes reference number
                headerLength = pdu.slice(cursor+4, cursor+6);
                referenceNumber = pdu.slice(cursor+6, cursor+10);
                parts = pdu.slice(cursor+10, cursor+12);
                currentPart = pdu.slice(cursor+12, cursor+14);
            }

            /*if(iei == '00')
                cursor += (udhLength-2)*4;
            else if(iei == '08')
                cursor += ((udhLength-2)*4)+2;
            else
                cursor += (udhLength-2)*2;*/
            cursor = cursor + (parseInt(udhLength, 16) + 1) * 2;
        }
        if(obj.encoding === '16bit')
            var text = this.decode16Bit(<any>pdu.slice(cursor), <any>dataLength);
        else if(obj.encoding === '7bit')
            if (udhi && iei=='00') var text = this.decode7Bit(pdu.slice(cursor), dataLength-7, 1); //If iei ==0, then there is some unpadding to do
            else if (udhi && iei=='08') var text = this.decode7Bit(pdu.slice(cursor), dataLength-8); //If no udhi or iei = 08 then no unpadding to do
            else var text = this.decode7Bit(pdu.slice(cursor), dataLength);
        else if(obj.encoding === '8bit')
            var text = ''; //TODO

        obj.text = text;

        if(udhi) {
            obj['udh'] = {
                'length' : udhLength,
                'iei' : iei,
            };

            if(iei == '00' || iei == '08') {
                obj['udh']['reference_number'] = referenceNumber;
                obj['udh']['parts'] = parseInt(parts);
                obj['udh']['current_part'] = parseInt(currentPart);
            }
        }

        return obj;
    }

    public static detectEncoding(dataCodingScheme: string|number): "7bit"|"8bit"|"16bit"
    {
        if (typeof dataCodingScheme === 'string') dataCodingScheme = parseInt(dataCodingScheme, 16);
        var binary = ('00000000'+(dataCodingScheme.toString(2))).slice(-8);
        if(binary == '00000000')
            return '7bit';
        var compressed = binary.slice(2, 1) === '1';
        var bitsHaveMeaning = binary.slice(3, 1) === '1';

        if(binary.slice(4,6) === '00')
            return '7bit';

        if(binary.slice(4,6) === '01')
            return '8bit';

        if(binary.slice(4,6) === '10')
            return '16bit';
    }

    public static decode16Bit(data: Array<{}>, length: number): string
    {
        var ucs2 = '';
        for(var i = 0; i <= data.length - 1;i = i + 4) {
            ucs2 += String.fromCharCode(+("0x"+data[i]+data[i+1]+data[i+2]+data[i+3]));
        }
        return ucs2;
    }
    public static decode7Bit(code: string, length: number, unPadding?: any)
    {
        var binary = '';
        for(var i = 0; i<code.length;i++)
            binary += ('0000'+parseInt(code.slice(i,i+1), 16).toString(2)).slice(-4);
    
        //This step is for 'unpadding' the padded data. If it has been encoded with 1 bit padding as it
        //happens when the sender used a 7-bit message concatenation (cf http://mobiletidings.com/2009/02/18/combining-sms-messages/)
        if (unPadding){
            var binary2 = '';
            binary = binary + '00000000';
            for (var i=0; i<binary.length/8 - 1 ; i++)
            {
                binary2 += (binary.slice((i+1)*8+(8-unPadding), (i+2)*8) + binary.slice(i*8,i*8+(8-unPadding)));
            }
            binary = binary2;
        }
    
        var bin = Array();
        var cursor = 0;
        var fromPrevious = '';
        var i = 0;
        while(binary[i]) {
            var remaining = 7 - fromPrevious.length;
            var toNext = 8 - remaining;
            bin[i] = binary.slice(cursor+toNext, cursor+toNext+remaining) + fromPrevious;
            var fromPrevious = binary.slice(cursor, cursor+toNext);
            if(toNext === 8)
                fromPrevious = '';
            else
                cursor += 8;
            i++;
        }
    
        var ascii = '';
        var esc = false; //last character was a ESC
        for(var i=0; i<length; i++){
            var codeNum = parseInt(bin[i], 2);
            if (codeNum == 0x1B){
                esc = true;
                continue;
            }
            if (esc)
                ascii += sevenBitEsc[codeNum];
            else
                ascii += sevenBitDefault[codeNum];
            esc = false;
        }
        return ascii;
    }

    public static encode7Bit(inTextNumberArray: Array<number>, paddingBits?: number): string
    {
        //as explained here http://mobiletidings.com/2009/07/06/how-to-pack-gsm7-into-septets/
        var paddingBits = paddingBits || 0;
        var bits = 0;
        var out = "";

        if(paddingBits)
            {
                bits = 7 - paddingBits;
                var octet = (inTextNumberArray[0] << (7 - bits)) % 256
                out += ('00' + octet.toString(16)).slice(-2);
                bits++;
            }

        for(var i = 0; i < inTextNumberArray.length; i++ )
        {
            if( bits == 7 )
            {
                bits = 0;
                continue;
            }
            var octet = (inTextNumberArray[i] & 0x7f) >> bits;
            if( i < inTextNumberArray.length - 1 )
                {octet |= (inTextNumberArray[i + 1] << (7 - bits))%256;}
            out += ('00' + octet.toString(16)).slice(-2);
            bits++;
        }
        return out;
    }
    public static encode16Bit(inTextNumberArray: Array<number>) {
        var out = '';
        for(var i = 0; i<inTextNumberArray.length;i++) {
            out += ('0000'+(inTextNumberArray[i].toString(16))).slice(-4);
        }
        return out;
    }
    public static messageToNumberArray(message: any)
    {
        //7bit GSM encoding according to GSM_03.38 character set http://en.wikipedia.org/wiki/GSM_03.38
        let res = [];
        for (var k = 0; k < message.text.length; k++)
        {
            if (message.encoding == '7bit')
            {
                var character = message.text[k];
                for(var i = 0;i < sevenBitDefault.length; i++)
                {
                    if(sevenBitDefault[i] == character)
                        res.push(i);
                    if (sevenBitEsc[i] == character){
                        res.push(0x1B); //escape character
                        res.push(i);
                    }
                }
            }
            else if (message.encoding == '16bit')
                res.push(message.text.charCodeAt(k));
        }
        return res;
    }
    public static parseStatusReport(pdu: string, smsc_parsed: any)
    {
        var cursor = 0;
        var obj = smsc_parsed;
    
        var header = parseInt(pdu.slice(cursor,cursor+2));
        cursor += 2;
        //TODO: maybe SMS-COMMAND here
    
        obj.reference = parseInt(pdu.slice(cursor,cursor+2), 16);
        cursor += 2;
    
        var senderSize = parseInt(pdu.slice(cursor,cursor+2), 16);
        if(senderSize % 2 === 1)
            senderSize++;
        cursor += 2;
    
        obj.sender_type = parseInt(pdu.slice(cursor,cursor+2));
        cursor += 2;
    
        obj.sender = this.deSwapNibbles(pdu.slice(cursor, cursor+senderSize));
        cursor += senderSize;
    
        obj.smsc_ts = this.parseTS(pdu.slice(cursor, cursor+14));
        cursor += 14;
        obj.discharge_ts = this.parseTS(pdu.slice(cursor, cursor+14));
        cursor += 14;
    
        obj.status = pdu.slice(cursor, cursor+2);
    
        return obj;
    }
    public static deSwapNibbles(nibbles): string
    {
        var out = '';
        for(var i = 0; i< nibbles.length; i=i+2) {
            if(nibbles[i] === 'F') //Dont consider trailing F.
                out += parseInt(nibbles[i+1], 16).toString(10);
            else
                out += parseInt(nibbles[i+1], 16).toString(10)+parseInt(nibbles[i], 16).toString(10);
        }
        return out;
    }
    public static swapNibbles(nibbles): string
    {
        var out = '';
        for(var i = 0; i< nibbles.length; i=i+2) {
            if(typeof(nibbles[i+1]) === 'undefined') // Add a trailing F.
                out += 'F'+parseInt(nibbles[i], 16).toString(10);
            else
                out += parseInt(nibbles[i+1], 16).toString(10)+parseInt(nibbles[i], 16).toString(10);
        }
        return out;
    }
    /**
     * Parses SMSC part of the PDU
     */
    public static parseSMSCPart(pdu: string):any
    {
        var cursor = 0;

        var buffer = new Buffer(pdu.slice(0,4), 'hex');
        var smscSize = buffer[0];
        var smscType = buffer[1].toString(16);
        var smscNum  = this.deSwapNibbles(pdu.slice(4, smscSize*2+2));
        return {
            'smsc' : smscNum,
            'smsc_type' : smscType,
            'length' : smscSize*2+2
        };
    }
    /**
     * Parses timestamp from PDU
     */
    public static parseTS(ts): Date
    {
        var t = this.deSwapNibbles(ts);

        var time = new Date;
        time.setFullYear(2000+parseInt (t.substr (0,2)));
        time.setMonth(parseInt (t.substr(2,2))-1);
        time.setDate(parseInt (t.substr(4,2)));
        time.setHours(parseInt (t.substr(6,2)));
        time.setMinutes(parseInt (t.substr(8,2)));
        time.setSeconds(parseInt (t.substr(10,2)));
    
        var firstTimezoneOctet = parseInt(t.substr(12,1));
        var binary = ("0000"+firstTimezoneOctet.toString(2)).slice(-4);
        var factor = binary.slice(0,1) === '1' ? 1 : -1;
        var binary = '0'+binary.slice(1, 4);
        var firstTimezoneOctet2 = parseInt(binary, 2).toString(10);
        var timezoneDiff = parseInt(firstTimezoneOctet2 + t.substr(13, 1));
        var time = new Date(time.getTime() + (timezoneDiff * 15 * 60000 * factor) - time.getTimezoneOffset()*60000);
    
        return time;
    }
    public static TP_MTI_To_String(tp_mti: "00" | "01" | "10")
    {
        switch (tp_mti)
        {
            case '00': return 'SMS-DELIVER';
            case '01': return 'SMS-SUBMIT';
            case '10': return 'SMS-STATUS-REPORT';
            default: return 'unknown';
        }
    }
    public static randomHexa(size: number)
    {
        var text = "";
        var possible = "0123456789ABCDEF";
        for( var i=0; i < size; i++ )
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
    /**
     * Return length of the octet
     */
    public static octetLength(str: string)
    {
        var len = (str.toString().length/2).toString(16).toUpperCase();
        if (len.length==1) len = '0' + len;
        return len;
    }
    /**
     * Encodes ussd request to PDU
     * @param ussd USSD Command
     */
    public static ussdEncode(ussd: string)
    {
        var arr = this.messageToNumberArray ({text:ussd,encoding:'7bit'});
        return this.encode7Bit(arr).toUpperCase();
    }
}

