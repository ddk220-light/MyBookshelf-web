var url_string = window.location.href;
var url = new URL(url_string);
var pageSize, noOfPage, pageno, totalrows, currentPage, datat;
var flag = false;
var selp, sels, sela, selt, sely;
var pub = [], subj = [], auth = [], yop = [], tom = [], ls = [];
var publist = '', subjlist = '', authlist = '', yoplist = '', tomlist = '', listString = '', urlstr = '';
var count = 0;

$(document).ready(function () {

    var dtf = getCookiedata("dtfound")
    //alert("dtf value : "+ dtf);
    if (dtf == "1") {
      //  alert("Data found");
        $.getJSON('EmployeeDataHandler.ashx', function (data) {
            favourite();
            var b = data;
            disp();

            function favourite() {
                if ($('#membersession').text() != '') {
                    $.ajax({
                        async: false,
                        type: "POST",
                        url: "favouritedata.asmx/GetFavourite",
                        datatype: "json",
                        data: "{'m_member':'" + $('#membersession').text() + "'}",
                        contentType: "application/json; charset=utf-8",
                        success: function (msg) {
                            listString = msg.d
                        },
                    });
                }

            }



            function appendData(sta, limit) {
                var str = '';

                if (url_string.indexOf("Cart.aspx") == -1 && url_string.indexOf("Favourite.aspx") == -1) {
                    str = "&" + url_string.split("?")[1].split("&s=s")[0];
                }
                if (str.indexOf("&resulttype=") != -1) {
                    str = str.split("&resulttype=")[0]
                }
                for (var i = sta; i <= limit; i++) {

                    var checked = "";
                    var image = 'book.gif';
                    if (b[i]['Select'] == true) {
                        checked = "checked";
                    }

                    if (b[i]['isbn'] != "") {
                        console.log(b[i]['isbn']);
                        image = 'http://covers.openlibrary.org/b/isbn/' + b[i]['isbn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false';
                        //$.ajax({
                        //    async: false,
                        //    dataType: 'json',
                        //    header: { "Set-Cookie": "HttpOnly; Secure; SameSite=None" },
                        //    url: 'https://www.googleapis.com/books/v1/volumes?q=isbn:' + b[i]['isbn'].split(';')[0].replace(/-/g, ''),
                        //    success: function (response) {
                        //        if (response.totalItems > 0 && response.items[0].volumeInfo.imageLinks) {
                        //            image = response.items[0].volumeInfo.imageLinks.thumbnail;
                        //        } else {
                        //            image = 'http://covers.openlibrary.org/b/isbn/' + b[i]['isbn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false';
                        //        }
                        //    },

                        //});
                    } else if (b[i]['issn'] != "") {
                        console.log(b[i]['issn']);
                        image = 'http://covers.openlibrary.org/b/issn/' + b[i]['issn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false';
                        //$.ajax({
                        //    async: false,
                        //    dataType: 'json',
                        //    header: { "Set-Cookie": "HttpOnly; Secure; SameSite=None" },
                        //    url: 'https://www.googleapis.com/books/v1/volumes?q=issn:' + b[i]['issn'].split(';')[0].replace(/-/g, ''),
                        //    success: function (response) {
                        //        if (response.totalItems > 0 && response.items[0].volumeInfo.imageLinks) {
                        //            image = response.items[0].volumeInfo.imageLinks.thumbnail;
                        //        } else {
                        //            image = 'http://covers.openlibrary.org/b/issn/' + b[i]['issn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false'
                        //        }
                        //    }
                        //});
                    }


                    //info.aspx?id=" + b[i]['RecID'] + str + "&resulttype=" + getPageName(url_string.split("?")[0]) + urldata() + "
                    var datad = "<tr class='datadisp'><td width='5%' style='text-align:center'><input type='checkbox' name='chkrec' value='" + b[i]['RecID'] + "' " + checked + " class='chkItem'/></td><td  style='text-align:center'><img id='img" + b[i]['RecID'] + "' src='" + image + "'  width='100px' height='140px' onerror='img(" + b[i]['RecID'] + ")'></td><td class='data'><a href='' id='btn" + b[i]['RecID'] + "' style='text-decoration: none;font-weight:bold'><span class='title'>" + b[i]['Title'] + "</span></a><br />";
                    //  Console.log("First time ");
                    if (b[i]['TypeofMaterial'] != "") {
                        datad += "<span class='typeofmat' style='display: none;' >" + b[i]['TypeofMaterial'] + "</span>";
                    }
                    if (b[i]['SrNo'] != "") {
                        datad += "<span class='srno' style='display: none;'>" + b[i]['SrNo'] + "</span>";
                    }
                    if (b[i]['Author'] != "") {
                        var au = "";
                        var splitau = b[i]['Author'].substring(0, b[i]['Author'].length - 1).split(";");
                        //  console.log("splitsu : " + splitau);
                        var fiau = "";
                        for (au in splitau) {
                            fiau += "<span class='author'>" + splitau[au] + "</span>,";
                        }
                        //   console.log("Fiau : " + fiau.substring(0, fiau.length - 1));
                        //  datad += "<label style='font-weight:normal;'>by&nbsp;</label><span class='author'>" + b[i]['Author'] + "</span><br />";
                        datad += "<label style='font-weight:normal;'>by&nbsp;</label>" + fiau.substring(0, fiau.length - 1) + "<br />";
                    }
                    if (b[i]['Publisher'] != "") {
                        datad += "<label style='color:navy'>Publisher Information :&nbsp;</label><span class='publisher' >" + b[i]['Publisher'] + "</span>, <span class='publishplace'>" + b[i]['PublisherPlace'] + " </span><span class='publishyr'>" + b[i]['PublisherYr'] + "</span><br />";
                    }
                    if (b[i]['AccessionNo'] != "") {
                        datad += "<label style='color:navy'>Accession no :&nbsp;</label><span class='accession'>" + b[i]['AccessionNo'] + "</span><br />";
                    }
                    if (b[i]['Subject'] != "") {
                        //   console.log("table of data 1111 : " + b[i]['Subject'].substring(0, b[i]['Subject'].length - 1).split(";"))
                        //  var bisubjects = b[i]['Subject'].substring(0, b[i]['Subject'].length-1).split(";");
                        var su = "";
                        var splitsu = b[i]['Subject'].substring(0, b[i]['Subject'].length - 1).split(";");
                        //   console.log("splitsu : " + splitsu);
                        var fisu = "";
                        for (su in splitsu) {
                            fisu += "<span class='subject'>" + splitsu[su] + "</span>,";
                        }
                        //   console.log("Fisu : " + fisu.substring(0,fisu.length-1));
                        datad += "<label style='color:navy'>Subject :&nbsp;</label>" + fisu.substring(0, fisu.length - 1) + "<br />";
                        //datad += "<label style='color:navy'>Subject :&nbsp;</label><span class='subject'>" + b[i]['Subject'] + "</span><br />";
                    }
                    if (b[i]['TotalCopy'] != "") {
                        datad += "<label style='color:navy'>Available Copies :&nbsp;</label><span class='avbook'>" + b[i]['Avbook'] + "</span>/<span class='callno'>" + b[i]['TotalCopy'] + "</span>&emsp;";
                    }
                    if (b[i]['Status'] != "") {
                        datad += "<label style='color:navy'>Status :&nbsp; </label><span class='status'>" + b[i]['Status'] + "</span>";
                    }


                    if (b[i]['Location'] != "") {
                        datad += "<br/><label style='color:navy'>Location :&nbsp; </label><span class='location'>" + b[i]['Location'] + "</span>&emsp;";
                    }
                    if (b[i]['Callno'] != "") {
                        datad += "<label style='color:navy'>Call no :&nbsp; </label><span class='callno'>" + b[i]['Callno'] + "</span>";
                    }
                    datad += "<span class='details btn viewbtn' id='" + b[i]['RecID'] + "' ><span class='glyphicon glyphicon-chevron-down'></span>&nbsp;<span class='det mobMoreDetails'>More Details</span></span>";
                    if (listString.indexOf("#" + b[i]['RecID'] + "#,") != -1) {
                        datad += "</td><td><span aria-hidden='true' onclick='urldataofbook(" + b[i]['RecID'] + ")' class='glyphicon glyphicon-link' style='font-size:25px;cursor: pointer;'></span><br><br><label class='favourite'><span aria-hidden='true' class='glyphicon glyphicon-heart' style='font-size:25px;color:red'></span><span class='recf' style='display:none;'>" + b[i]['RecID'] + "</span></label><br/>";
                    } else {
                        datad += "</td><td><span aria-hidden='true' onclick='urldataofbook(" + b[i]['RecID'] + ")' class='glyphicon glyphicon-link' style='font-size:25px;cursor: pointer;'></span><br><br><label class='favourite'><span aria-hidden='true' class='glyphicon glyphicon-heart-empty' style='font-size:25px'></span><span class='recf' style='display:none;'>" + b[i]['RecID'] + "</span></label><br/>";
                    }

                    if (url_string.indexOf("Cart.aspx") == -1) {
                        if (getCookie('reclist') != '') {
                            if (getCookie('reclist').indexOf("#" + b[i]['RecID'] + "#,") == -1) {
                                datad += "<label class='cart'><span aria-hidden='true' class='glyphicon glyphicon-shopping-cart' style='font-size:25px'></span><span class='recc' style='display:none;'>" + b[i]['RecID'] + "</span></label></td></tr>";
                            }
                            else {
                                datad += "<label class='cart'><span aria-hidden='true' class='glyphicon glyphicon-ok' style='font-size:25px'></span><span class='recc' style='display:none;'>" + b[i]['RecID'] + "</span></label></td></tr>";
                            }
                        } else {
                            datad += "<label class='cart'><span aria-hidden='true' class='glyphicon glyphicon-shopping-cart' style='font-size:25px'></span><span class='recc' style='display:none;'>" + b[i]['RecID'] + "</span></label></td></tr>";
                        }

                    } else {
                        datad += "<label class='cart'><span aria-hidden='true' class='glyphicon glyphicon-remove' style='font-size:25px'></span><span class='recc' style='display:none;'>" + b[i]['RecID'] + "</span></label></td></tr>";
                    }
                    datad += "<tr><td></td><td colspan='2'><div class='more' id =more" + b[i]['RecID'] + "></div></td><td></td></tr>";
                    $('#result_dtlist').append(datad);
                }
            }

            function appendDatals(sta, limit) {
                var str = '';

                if (url_string.indexOf("Cart.aspx") == -1 && url_string.indexOf("Favourite.aspx") == -1) {
                    str = "&" + url_string.split("?")[1].split("&s=s")[0];
                }
                if (str.indexOf("&resulttype=") != -1) {
                    str = str.split("&resulttype=")[0]
                }
                for (var j = sta; j <= limit; j++) {

                    var i = ls[j] - 1;

                    var checked = "";
                    var image = 'book.gif';
                    if (b[i]['Select'] == true) {
                        checked = "checked";
                    }
                    if (b[i]['isbn'] != "") {
                        console.log(b[i]['isbn']);
                        image = 'http://covers.openlibrary.org/b/isbn/' + b[i]['isbn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false';

                    } else if (b[i]['issn'] != "") {
                        console.log(b[i]['issn']);
                        image = 'http://covers.openlibrary.org/b/issn/' + b[i]['issn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false';

                    }
                    //info.aspx?id=" + b[i]['RecID'] + str + "&resulttype=" + getPageName(url_string.split("?")[0]) + urldata() + "
                    var datad = "<tr class='datadisp'><td width='5%' style='text-align:center'><input type='checkbox' value=" + b[i]['RecID'] + " " + checked + " class='chkItem'/></td><td style='text-align:center'><img id='img" + b[i]['RecID'] + "'  src='" + image + "' height='140px' width='100px' onerror='img(" + b[i]['RecID'] + ")'></td><td class='data'><a href='' id='btn" + b[i]['RecID'] + "' style='text decoration: none;font-weight:bold'><span class='title'>" + b[i]['Title'] + "</span></a><br />";
                    // Console.log("Second time ");
                    if (b[i]['TypeofMaterial'] != "") {
                        datad += "<span class='typeofmat' style='display: none;' >" + b[i]['TypeofMaterial'] + "</span>";
                    }
                    if (b[i]['SrNo'] != "") {
                        datad += "<span class='srno' style='display: none;'>" + b[i]['SrNo'] + "</span>";
                    }
                    if (b[i]['Author'] != "") {
                        var au = "";
                        var splitau = b[i]['Author'].substring(0, b[i]['Author'].length - 1).split(";");
                        //  console.log("splitsu : " + splitau);
                        var fiau = "";
                        for (au in splitau) {
                            fiau += "<span class='author'>" + splitau[au] + "</span>,";
                        }
                        //   console.log("Fiau : " + fiau.substring(0, fiau.length - 1));
                        datad += "<label style='font-weight:normal;'>by&nbsp;</label>" + fiau.substring(0, fiau.length - 1) + "<br />";
                        //  datad += "<label style='font-weight:normal;'>by&nbsp;</label><span class='author' style='font-weight:bold'>" + b[i]['Author'] + "</span><br />";
                    }
                    if (b[i]['Publisher'] != "") {
                        datad += "<label style='color:navy'>Publisher Information :&nbsp;</label><span class='publisher'>" + b[i]['Publisher'] + "</span>, <span class='publishplace'>" + b[i]['PublisherPlace'] + " </span><span class='publishyr'>" + b[i]['PublisherYr'] + "</span><br />";
                    }
                    if (b[i]['AccessionNo'] != "") {
                        datad += "<label style='color:navy'>Accession no :&nbsp;</label><span class='accession'>" + b[i]['AccessionNo'] + "</span>";
                    }
                    if (b[i]['Subject'] != "") {
                        // console.log("table of data 2222 : " + b[i]['Subject'].substring(0, b[i]['Subject'].length - 1).split(";"))
                        var su = "";
                        var splitsu = b[i]['Subject'].substring(0, b[i]['Subject'].length - 1).split(";");
                        //  console.log("splitsu : " + splitsu);
                        var fisu = "";
                        for (su in splitsu) {
                            fisu += "<span class='subject'>" + splitsu[su] + "</span>,";
                        }
                        //  console.log("Fisu : " + fisu.substring(0, fisu.length - 1));
                        datad += "<br><label style='color:navy'>Subject :&nbsp;</label>" + fisu.substring(0, fisu.length - 1);
                        // datad += "<br><label style='color:navy'>Subject :&nbsp;</label><span class='subject'>" + b[i]['Subject'] + "</span>";
                    }
                    if (b[i]['TotalCopy'] != "") {
                        datad += "<br /><label style='color:navy'>Available Copies :&nbsp;</label><span class='avbook'>" + b[i]['Avbook'] + "</span>/<span class='callno'>" + b[i]['TotalCopy'] + "</span>&emsp;";
                    }
                    if (b[i]['Status'] != "") {
                        datad += "<label style='color:navy'>Status :&nbsp; </label><span class='status'>" + b[i]['Status'] + "</span>";
                    }
                    if (b[i]['Location'] != "") {
                        datad += "<br/><label style='color:navy'>Location :&nbsp; </label><span class='location'>" + b[i]['Location'] + "</span>&emsp;";
                    }
                    if (b[i]['Callno'] != "") {
                        datad += "<label style='color:navy'>Call no :&nbsp; </label><span class='callno'>" + b[i]['Callno'] + "</span>";
                    }
                    datad += "<label class='details btn viewbtn' id='" + b[i]['RecID'] + "' style='float:right'><span class='glyphicon glyphicon-chevron-down'></span>&nbsp;<span class='det'>More Details</span></label";
                    if (listString.indexOf("#" + b[i]['RecID'] + "#,") != -1) {
                        datad += "</td><td><span aria-hidden='true' onclick='urldataofbook(" + b[i]['RecID'] + ")' class='glyphicon glyphicon-link' style='font-size:25px;cursor: pointer;'></span><br><br><label class='favourite'><span aria-hidden='true' class='glyphicon glyphicon-heart' style='font-size:25px;color:red'></span><span class='recf' style='display:none;'>" + b[i]['RecID'] + "</span></label><br/>";
                    } else {
                        datad += "</td><td><span aria-hidden='true' onclick='urldataofbook(" + b[i]['RecID'] + ")' class='glyphicon glyphicon-link' style='font-size:25px;cursor: pointer;'></span><br><br><label class='favourite'><span aria-hidden='true' class='glyphicon glyphicon-heart-empty' style='font-size:25px'></span><span class='recf' style='display:none;'>" + b[i]['RecID'] + "</span></label><br/>";
                    }
                    if (url_string.indexOf("Cart.aspx") == -1) {
                        datad += "<label class='cart'><span aria-hidden='true' class='glyphicon glyphicon-shopping-cart' style='font-size:25px'></span><span class='recc' style='display:none;'>" + b[i]['RecID'] + "</span></label></td></tr>";
                    } else {
                        datad += "<label class='cart'><span aria-hidden='true' class='glyphicon glyphicon-remove' style='font-size:25px'></span><span class='recc' style='display:none;'>" + b[i]['RecID'] + "</span></label></td></tr>";
                    }
                    datad += "<tr><td></td><td colspan='2'><div class='more' id =more" + b[i]['RecID'] + "></div></td><td></td></tr>";
                    $('#result_dtlist').append(datad);
                }
            }

            function printData() {
                var datap = ""
                for (var i = 0; i < b.length; i++) {
                    var image = 'book.gif';

                    if (b[i]['isbn'] != "") {
                        console.log(b[i]['isbn']);
                        image = 'http://covers.openlibrary.org/b/isbn/' + b[i]['isbn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false';

                    } else if (b[i]['issn'] != "") {
                        console.log(b[i]['issn']);
                        image = 'http://covers.openlibrary.org/b/issn/' + b[i]['issn'].split(';')[0].replace(/-/g, '') + '-M.jpg?default=false';

                    }
                    if (b[i]['Select'] == true) {
                        datap += "<tr class='datadisp'><td style='text-align:center'><img id='img" + b[i][' RecID'] + "'  src='" + image + "' height='140px' width='100px' onerror='img(" + b[i]['RecID'] + ")'></td><td class='data'><a href='' id='btn" + b[i][' RecID'] + "' style='text decoration: none;font-weight:bold;color: #337ab7;'><span class='title'>" + b[i]['Title'] + "</span></a><br />"
                        if (b[i]['Author'] != "") {
                            datap += "<label style='font-weight:normal;'>by&nbsp;</label><span class='author' style='font-weight:bold;color: #337ab7;'>" + b[i]['Author'] + "</span><br />";
                        }
                        if (b[i]['Publisher'] != "") {
                            datap += "<label style='color:navy'>Publisher Information :&nbsp;</label><span class='publisher' >" + b[i]['Publisher'] + " </span>, <span class='publishplace'>" + b[i]['PublisherPlace'] + " </span><span class='publishyr'>" + b[i]['PublisherYr'] + "</span><br />";
                        }
                        if (b[i]['AccessionNo'] != "") {
                            datap += "<label style='color:navy'>Accession no :&nbsp;</label><span class='accession'>" + b[i]['AccessionNo'] + "</span><br />";
                        }
                        if (b[i]['Subject'] != "") {
                            datap += "<label style='color:navy'>Subject :&nbsp;</label><span class='subject'>" + b[i]['Subject'] + "</span><br />";
                        }
                        if (b[i]['TotalCopy'] != "") {
                            datap += "<label style='color:navy'>Available Copies :&nbsp;</label><span class='avbook'>" + b[i]['Avbook'] + "</span>/<span class='callno'>" + b[i]['TotalCopy'] + "</span>&nbsp;&nbsp;&nbsp;&nbsp;";
                        }
                        if (b[i]['Status'] != "") {
                            datap += "<label style='color:navy'>Status :&nbsp; </label><span class='status'>" + b[i]['Status'] + "</span><br/>";
                        }
                        if (b[i]['Location'] != "") {
                            datap += "<label style='color:navy'>Location :&nbsp; </label><span class='location'>" + b[i]['Location'] + "</span>&nbsp;&nbsp;&nbsp;&nbsp;";
                        }
                        if (b[i]['Callno'] != "") {
                            datap += "<label style='color:navy'>Call no :&nbsp; </label><span class='callno'>" + b[i]['Callno'] + "</span>";
                        }
                        count++;
                    }
                }
                return datap;
            }

            function getCookie(cname) {
                var name = cname + "=";
                var ca = document.cookie.split(';');
                for (var i = 0; i < ca.length; i++) {
                    var c = ca[i];
                    while (c.charAt(0) == ' ') {
                        c = c.substring(1);
                    }
                    if (c.indexOf(name) == 0) {
                        return c.substring(name.length, c.length);
                    }
                }
                return "";
            }

            function getPageName(url) {
                var index = url.lastIndexOf("/") + 1;
                var filenameWithExtension = url.substr(index);
                var filename = filenameWithExtension.split(".")[0];
                return filename;
            }

            function datadisp() {
                pageSize = $("#cmbrec").children("option:selected").val();
                noOfPage = totalrows / pageSize;
                noOfPage = Math.ceil(noOfPage);
                if (sessionStorage.getItem('pageno') == null) {
                    sessionStorage.setItem('pageno', "1");
                    $(".prev").hide();
                    $(".fdot").hide();
                    $(".first").hide();
                }
                pageno = parseInt(sessionStorage.getItem('pageno'));
                $(".prev").addClass(String(pageno - 1));
                $(".next").addClass(String(pageno + 1));
                $(".page_style").show();
                $("#divPages").empty();
                $("#divPage").empty();
                for (var i = 1; i <= noOfPage; i++) {
                    if (i == pageno) {
                       // console.log("H1");
                        $("#divPages").append(' <li class="page page-item active"><a class="page-link">' + i + '</a></li>');
                        $("#divPage").append(' <li class="page page-item active"><a class="page-link">' + i + '</a></li>');
                    }
                    else {
                       // console.log("HB1")
                        $("#divPages").append('<li class="page page-item"><a class="page-link">' + i + '</a></li>');
                        $("#divPage").append('<li class="page page-item"><a class="page-link">' + i + '</a></li>');
                    }
                }


                $("#lbl_mincnt").text((pageno * pageSize) - pageSize + 1);
                $("#lbl_maxcnt").text((pageno * pageSize));
                if (totalrows <= pageSize) {
                    $("#lbl_maxcnt").text((totalrows));
                    $(".page_style").hide();
                } else if (totalrows <= (pageno * pageSize)) {
                    $("#lbl_maxcnt").text((totalrows));
                }
                $("#lbl_TotalCnt").text(totalrows);

                $(".page").hide();
                if (pageno == 1) {
                    for (var n = pageno; n <= pageno + 2; n++) {
                        $(".page:nth-child(" + n + ")").show();
                    }
                } else if (pageno == noOfPage) {
                    for (var n = pageno - 2; n <= pageno; n++) {
                        $(".page:nth-child(" + n + ")").show();
                    }
                } else {
                    for (var n = pageno - 1; n <= pageno + 1; n++) {
                        $(".page:nth-child(" + n + ")").show();
                    }
                }
                CurrentPage(pageno)
            }

            function filterresults() {
                selp = $(".pub").find(".filtervalue").text().trim();
                sels = $(".subj").find(".filtervalue").text().trim();
                sela = $(".auth").find(".filtervalue").text().trim();
                selt = $(".tom").find(".filtervalue").text().trim();
                sely = $(".yop").find(".filtervalue").text().trim();

                datat = b;
                if ($(".pub").length == 1) {
                    datat = datat.filter(function (n) {
                        return n.Publisher.replace(";", "").trim() === selp;
                    });
                }
                if ($(".subj").length == 1) {
                    datat = datat.filter(function (n) {
                        //  console.log("SS : " + datat + " return : " + n.Subject.replace(";", "").trim() + " sels : " + sels);
                        return n.Subject.split(";").includes(sels);
                    });
                }
                if ($(".auth").length == 1) {
                    datat = datat.filter(function (n) {
                        // return n.Author.replace(";", "").trim() === sela;
                        return n.Author.split(";").includes(sela);
                    });
                }
                if ($(".tom").length == 1) {
                    datat = datat.filter(function (n) {
                        return n.TypeofMaterial.replace(";", "").trim() === selt;
                    });
                }
                if ($(".yop").length == 1) {
                    datat = datat.filter(function (n) {
                        return n.PublisherYr.replace(";", "").trim() === sely;
                    });
                }
                for (var i = 0; i < datat.length; i++) {
                    ls.push(datat[i]['SrNo']);
                }
                totalrows = datat.length;

                //datat.each(function () { ls.push($(this).find(".srno").text() - 1) });
                datafilter();
                showfilters();
                datadisp();
            }

            function displayevent() {
                $(".page").each(function () {
                    if ($(this).css('display') === 'block') {
                        $(this).addClass('selected');
                    }
                    else {
                        $(this).removeClass('selected');
                    }
                });
                $(".chkHeader").prop('checked', true);

                $('#result_dtlist').find(".chkItem").each(function () {
                    if (this.checked == false) {
                        $(".chkHeader").prop('checked', false);
                    }

                });
            }

            function urldata() {
                var data = "";
                if ($(".pub").length == 1) {
                    data += "&publisher=" + selp
                }
                if ($(".subj").length == 1) {
                    data += "&subject=" + sels
                }
                if ($(".auth").length == 1) {
                    data += "&author=" + sela
                }
                if ($(".yop").length == 1) {
                    data += "&yop=" + sely
                }
                if ($(".tom").length == 1) {
                    data += "&tom=" + selt
                }
                return data;
            }

            function disp() {
                totalrows = b.length;

                $('#pub').html($('#ContentPlaceHolder1_pubf').html());
                $('#subj').html($('#ContentPlaceHolder1_subjf').html());
                $('#auth').html($('#ContentPlaceHolder1_authf').html());
                $('#tom').html($('#ContentPlaceHolder1_tomf').html());
                $('#yop').html($('#ContentPlaceHolder1_yopf').html());
                showfilters();
                datadisp();
                //if (url_string.split("?")[1].indexOf("&publisher=") != -1) {
                //    var publisher = url_string.split("?")[1].trim("&publisher=")[1].trim("&")[0]
                //    $('#pub').find("tr").each(function () {
                //        if ($(this).text().indexOf(publisher) != -1) {
                //            $(this).click();
                //        }
                //    });
                //}

                //if (url_string.split("?")[1].indexOf("&author=") != -1) {
                //    var author = url_string.split("?")[1].trim("&author=")[1].trim("&")[0]
                //    $('#auth').find("tr").each(function () {
                //        if ($(this).text().indexOf(author) != -1) {
                //            $(this).click();
                //        }
                //    });
                //}

                //if (url_string.split("?")[1].indexOf("&subject=") != -1) {
                //    var subject = url_string.split("?")[1].trim("&subject=")[1].trim("&")[0]
                //    $('#subj').find("tr").each(function () {
                //        if ($(this).text().indexOf(subject) != -1) {
                //            $(this).click();
                //        }
                //    });
                //}

                //if (url_string.split("?")[1].indexOf("&yop=") != -1) {
                //    var yop = url_string.split("?")[1].trim("&yop=")[1].trim("&")[0]
                //    $('#yop').find("tr").each(function () {
                //        if ($(this).text().indexOf(yop) != -1) {
                //            $(this).click();
                //        }
                //    });
                //}

                //if (url_string.split("?")[1].indexOf("&tom=") != -1) {
                //    var tom = url_string.split("?")[1].trim("&tom=")[1].trim("&")[0]
                //    $('#tom').find("tr").each(function () {
                //        if ($(this).text().indexOf(tom) != -1) {
                //            $(this).click();
                //        }
                //    });
                //}
                //for (var k = (pageno * pageSize) - (pageSize - 1) - 1; k <= (pageno * pageSize) - 1; k++) {
                //    if (k < totalrows) {
                //        appendData(k, urldata());
                //    }
                //}
                if ((pageno * pageSize) < totalrows) {
                    appendData((pageno * pageSize) - (pageSize - 1) - 1, (pageno * pageSize) - 1);

                } else {
                    appendData((pageno * pageSize) - (pageSize - 1) - 1, totalrows - 1);

                }


                displayevent();
            }

            function sortObject(obj) {
                var arr = [];
                var prop;
                for (prop in obj) {
                    if (obj.hasOwnProperty(prop)) {
                        arr.push({
                            'key': prop,
                            'value': obj[prop]
                        });
                    }
                }
                arr.sort(function (a, b) {
                    return a.value - b.value;
                });
                return arr; // returns array
            }

            function datafilter() {
                $('#pub').find('tbody').empty();
                $('#subj').find('tbody').empty();
                $('#auth').find('tbody').empty();
                $('#yop').find('tbody').empty();
                $('#tom').find('tbody').empty();

                countp = datat.map(function (n) {
                    return n.Publisher.replace(";", "");
                }).filter(function (n) {
                    return n != "";
                }).reduce(function (r, a) {
                    r[a] = (r[a] || 0) + 1;
                    return r;
                }, {});
                countp = sortObject(countp).reverse().slice(0, 25);

                for (i = 0; i < countp.length; ++i) {

                    var row = '<tr><td> ' + countp[i].key + ' </td> <td> ' + countp[i].value + ' </td></tr>'
                    $('#pub').find('tbody').append(row);
                }

                //  console.log("Data of Subject : " + datat + " Count : " + datat.length + " keyword : " + sels);
                counts = datat.map(function (n) {
                    return n.Subject;
                }).filter(function (n) {
                    return n != "";
                }).reduce(function (r, a) {
                    r[a] = (r[a] || 0) + 1;
                    return r;
                }, {});
                counts = sortObject(counts).reverse().slice(0, 25);
                var sulist = [];
                var sulistf = "";
                // for (i = 0; i < counts.length; ++i) {
                // console.log("sels : " + sels + " sels length : " + sels.length);
                if (sels.length == 0) {
                    for (i = 0; i < counts.length; ++i) {
                        // var row = '<tr><td> ' + counts[i].key + ' </td> <td> ' + counts[i].value + ' </td></tr>'
                        var row = "";
                        var subjdt = counts[i].key.substring(0, counts[i].key.length - 1).split(";");
                        //   console.log("subjdt : " + subjdt);
                        var s = "";
                        for (s in subjdt) {
                            sulist[sulist.length] = subjdt[s] + ";" + counts[i].value;
                            //   var row = row + '<tr><td> ' + subjdt[s] + ' </td> <td> ' + counts[i].value + ' </td></tr>'
                        }
                    }
                    //   console.log("sulist " + sulist);
                    for (j = 0; j < sulist.length; j++) {
                        var sb = sulist[j].split(";");
                        var itemc = 0;
                        var itc = 0;
                        for (k = 0; k < sulist.length; k++) {
                            var kb = sulist[k].split(";");
                            if (sb[0] == kb[0]) {
                                itemc = Number.parseInt(kb[1]);
                                itc += itemc;
                            }
                        }
                        //   console.log("item : " + sb[0] + " : count : " + itemc);
                        if (!sulistf.split(";").includes(sb[0])) {
                            sulistf = sulistf + ";" + sb[0];
                            //   console.log("item : " + sb[0] + " : count : " + itc);
                            //if (itc.substring(0, 1) == 0) {
                            //    var row = row + '<tr><td> ' + sb[0] + ' </td> <td> ' + itc.substring(1) + ' </td></tr>'
                            //}
                            //else {
                            var row = row + '<tr><td> ' + sb[0] + ' </td> <td> ' + itc + ' </td></tr>'
                            //  }

                        }

                    }

                    $('#subj').find('tbody').append(row);

                }
                else {
                    //   console.log("Key : " + sels + " value sc: " + datat.length );
                    var row = '<tr><td> ' + sels + ' </td> <td> ' + datat.length + ' </td></tr>'
                    $('#subj').find('tbody').append(row);
                }

                //  }

                counta = datat.map(function (n) {
                    return n.Author;
                }).filter(function (n) {
                    return n != "";
                }).reduce(function (r, a) {
                    r[a] = (r[a] || 0) + 1;
                    return r;
                }, {});
                counta = sortObject(counta).reverse().slice(0, 25);
                var authlist = [];
                var authlistf = "";
                //   for (i = 0; i < counta.length; ++i) {
                //       var row = '<tr><td> ' + counta[i].key + ' </td> <td> ' + counta[i].value + ' </td></tr>'
                //       $('#auth').find('tbody').append(row);
                //  }

                if (sela.length == 0) {
                    for (i = 0; i < counta.length; ++i) {
                        // var row = '<tr><td> ' + counta[i].key + ' </td> <td> ' + counta[i].value + ' </td></tr>'
                        var row = "";
                        var audt = counta[i].key.substring(0, counta[i].key.length - 1).split(";");
                        // console.log("counta : " + audt);
                        var s = "";
                        for (s in audt) {
                            authlist[authlist.length] = audt[s] + ";" + counta[i].value;
                            //  var row = row + '<tr><td> ' + audt[s] + ' </td> <td> ' + counta[i].value + ' </td></tr>'
                        }
                    }
                    for (j = 0; j < authlist.length; j++) {
                        var sb = authlist[j].split(";");
                        var itemc = 0;
                        var itc = 0;
                        for (k = 0; k < authlist.length; k++) {
                            var kb = authlist[k].split(";");
                            if (sb[0] == kb[0]) {
                                itemc = Number.parseInt(kb[1]);
                                itc += itemc;
                            }
                        }
                        //   console.log("item : " + sb[0] + " : count : " + itemc);
                        if (!authlistf.split(";").includes(sb[0])) {
                            authlistf = authlistf + ";" + sb[0];
                            //   console.log("item : " + sb[0] + " : count : " + itc);
                            //if (itc.substring(0, 1) == 0) {
                            //    var row = row + '<tr><td> ' + sb[0] + ' </td> <td> ' + itc.substring(1) + ' </td></tr>'
                            //}
                            //else {
                            var row = row + '<tr><td> ' + sb[0] + ' </td> <td> ' + itc + ' </td></tr>'
                            //  }

                        }

                    }
                    $('#auth').find('tbody').append(row);

                }
                else {
                    // console.log("Key : " + sela + " value sc: " + datat.length);
                    var row = '<tr><td> ' + sela + ' </td> <td> ' + datat.length + ' </td></tr>'
                    $('#auth').find('tbody').append(row);
                }

                countm = datat.map(function (n) {
                    return n.TypeofMaterial.replace(";", "");
                }).filter(function (n) {
                    return n != "";
                }).reduce(function (r, a) {
                    r[a] = (r[a] || 0) + 1;
                    return r;
                }, {});
                countm = sortObject(countm).reverse().slice(0, 25);

                for (i = 0; i < countm.length; ++i) {
                    var row = '<tr><td> ' + countm[i].key + ' </td> <td> ' + countm[i].value + ' </td></tr>'
                    $('#tom').find('tbody').append(row);
                }

                county = datat.map(function (n) {
                    return n.PublisherYr.replace(";", "");
                }).filter(function (n) {
                    return n != "";
                }).reduce(function (r, a) {
                    r[a] = (r[a] || 0) + 1;
                    return r;
                }, {});
                county = sortObject(county).reverse().slice(0, 25);

                for (i = 0; i < county.length; ++i) {
                    var row = '<tr><td> ' + county[i].key + ' </td> <td> ' + county[i].value + ' </td></tr>'
                    $('#yop').find('tbody').append(row);
                }
            }

            function showfilters() {
                if ($("#pub").find("tr").length < 5) {
                    $("#read_pub").hide();
                } else {
                    $("#pub").find("tr").slice(5, $("#pub").find("tr").length).hide();
                    $("#read_pub").text("More Publisher(s)");
                    $("#read_pub").show();
                }
                if ($("#subj").find("tr").length < 5) {
                    $("#read_subj").hide();
                } else {
                    $("#subj").find("tr").slice(5, $("#subj").find("tr").length).hide();
                    $("#read_subj").text("More Subject(s)");
                    $("#read_subj").show();
                }
                if ($("#auth").find("tr").length < 5) {
                    $("#read_auth").hide();
                } else {
                    $("#auth").find("tr").slice(5, $("#auth").find("tr").length).hide();
                    $("#read_auth").text("More Author(s)");
                    $("#read_auth").show();
                }
                if ($("#yop").find("tr").length < 5) {
                    $("#read_yop").hide();
                } else {
                    $("#yop").find("tr").slice(5, $("#yop").find("tr").length).hide();
                    $("#read_yop").text("More Year(s)");
                    $("#read_yop").show();
                }
                if ($("#tom").find("tr").length < 5) {
                    $("#read_tom").hide();
                } else {
                    $("#tom").find("tr").slice(5, $("#tom").find("tr").length).hide();
                    $("#read_tom").text("More Material(s)");
                    $("#read_tom").show();
                }
            }

            function filter() {

                if ($(".btnclear").length == 0) {
                    flag = false;
                    //currentPage = 1;
                    // sessionStorage.setItem('pageno', 1);
                    disp();
                    //  document.getElementsByClassName(".page").addEventListener("click", pg);
                    // $(".page").addEventListener("click", pageclick);
                    $(".page").click(function () {

                        pg(this)
                    });
                    //  console.log("call...1");
                } else {
                    ls = [];
                    flag = true;
                    session();
                    filterresults();
                    // console.log("call...2");
                    if (datat.length < pageSize) {
                        //for (k = 0; k < ls.length; ++k) {
                        //    if (typeof ls[k] !== 'undefined') {
                        //        appendData(ls[k], urldata());
                        //    }
                        //}
                        //  console.log("call...2 of 1");
                        appendDatals(0, ls.length)
                    } else {
                        //for (var k = 0; k < pageSize; ++k) {
                        //    if (typeof ls[k] !== 'undefined') {
                        //        appendData(ls[k], urldata());
                        //    }
                        //}
                        //   console.log("call...2 of 2");
                        appendDatals(0, pageSize);
                        $(".page").click(function () {

                            pg(this)
                        });
                        // appendDatals(0, ls.length);
                    }
                }
                $('#SearchParameters').removeClass("collapse show");
            }


            function session() {
                $(".prev").removeClass(String(parseInt(sessionStorage.getItem('pageno')) - 1));
                $(".next").removeClass(String(parseInt(sessionStorage.getItem('pageno')) + 1));
                sessionStorage.removeItem('pageno');
            }

            function CurrentPage(currentPage) {
                if (currentPage == 1) {
                    $(".next").show();
                    $(".ldot").show();
                    $(".last").show();
                    $(".prev").hide();
                    $(".fdot").hide();
                    $(".first").hide();
                    for (var n = currentPage; n <= currentPage + 2; n++) {
                        $(".page:nth-child(" + n + ")").show();
                    }
                }
                else if (currentPage == noOfPage) {
                    $(".next").hide();
                    $(".ldot").hide();
                    $(".last").hide();
                    $(".prev").show();
                    $(".fdot").show();
                    $(".first").show();
                    for (var n = currentPage - 2; n <= currentPage; n++) {
                        $(".page:nth-child(" + n + ")").show();
                    }
                }
                else {
                    $(".next").show();
                    $(".ldot").show();
                    $(".last").show();
                    $(".prev").show();
                    $(".fdot").show();
                    $(".first").show();
                    for (var n = currentPage - 1; n <= currentPage + 1; n++) {
                        $(".page:nth-child(" + n + ")").show();
                    }
                }
            }

            $("#cmbrec").change(function () {
                pageSize = $(this).children("option:selected").val();
                $('#result_dtlist').empty();
                filter();
            });

            $('#pub, #subj, #auth, #yop, #tom').on("click", "tr", function () {
                var id = $(this).parent().parent().attr('id');
                if ($("#facetbtn").find("." + id).length == 0) {
                    $("#facetbtn").append('<div class="btn btnclear ' + id + '"><label class="filtervalue">' + $(this).find("td:first-child").text() + '</label><span aria-hidden="true" class="glyphicon glyphicon-remove"></span></div>');

                    $('#result_dtlist').empty();
                    filter();
                }
            });

            $('#result_dtlist').on("click", ".author", function () {
                if ($("#facetbtn").find(".auth").length == 0) {
                    $("#facetbtn").append('<div class="btn btnclear auth"><label class="filtervalue">' + $(this).text().replace(";", "").trim() + '</label><span aria-hidden="true" class="glyphicon glyphicon-remove"></span></div>');
                    $('#result_dtlist').empty();
                    filter();
                }
            });

            $('#result_dtlist').on("click", ".subject", function () {
                if ($("#facetbtn").find(".subj").length == 0) {
                    $("#facetbtn").append('<div class="btn btnclear subj"><label class="filtervalue">' + $(this).text().replace(";", "").trim() + '</label><span aria-hidden="true" class="glyphicon glyphicon-remove"></span></div>');
                    $('#result_dtlist').empty();
                    filter();
                }
            });

            $('#result_dtlist').on("click", ".publisher", function () {
                if ($("#facetbtn").find(".pub").length == 0) {
                    $("#facetbtn").append('<div class="btn btnclear pub"><label class="filtervalue">' + $(this).text().replace(";", "").trim() + '</label><span aria-hidden="true" class="glyphicon glyphicon-remove"></span></div>');
                    $('#result_dtlist').empty();
                    filter();
                }
            });
            $('#result_dtlist').on("click", ".details", function () {
                $('.more').empty();

                var rec = $(this).attr('id');

                if ($(this).find(".det").text() == "Less Details") {
                    $('#more' + rec).empty();
                    $('#result_dtlist').find(".details").find(".det").text("More Details");
                    $('#result_dtlist').find(".details").find(".glyphicon").removeClass('glyphicon-chevron-up');
                    $('#result_dtlist').find(".details").find(".glyphicon").addClass('glyphicon-chevron-down');
                } else {
                    $('#result_dtlist').find(".details").find(".det").text("More Details");
                    $(this).find(".det").text("Less Details");
                    $('#result_dtlist').find(".details").find(".glyphicon").addClass('glyphicon-chevron-down');
                    $(this).find(".glyphicon").removeClass('glyphicon-chevron-down');
                    $(this).find(".glyphicon").addClass('glyphicon-chevron-up');
                    $.get("ViewDetails.aspx?ID=" + rec, function (data) {
                        $('#more' + rec).html(data);
                    });
                }

                //$(this).parent().find('.more').load("ViewDetails.aspx?ID=" + rec, function () { });
            });

            $('#result_dtlist').on("click", ".cart", function () {
                var recid = $(this).find(".recc").text();
                var date = new Date();
                date.setTime(date.getTime() + (24 * 60 * 60 * 1000));
                if (url_string.indexOf("Cart.aspx") == -1) {
                    if (getCookie('reclist') == '') {
                        document.cookie = "reclist=#" + recid + "#,;expires=" + date.toGMTString();
                        reccount = 1;
                        document.cookie = "reccount=" + reccount + ";expires=" + date.toGMTString();
                    } else {
                        if (getCookie('reclist').indexOf("#" + recid + "#,") == -1) {
                            var rec = getCookie('reclist') + "#" + recid + "#,";
                            document.cookie = "reclist=" + rec + ";expires=" + date.toGMTString();
                            reccount = parseInt(getCookie('reccount')) + 1;
                            document.cookie = "reccount=" + reccount + ";expires=" + date.toGMTString();
                        } else {
                            reccount = parseInt(getCookie('reccount'));
                        }
                    }
                    $(this).find('.glyphicon').removeClass('glyphicon-shopping-cart');
                    $(this).find('.glyphicon').addClass('glyphicon-ok');
                    $("#cartcount").text(reccount);

                } else {
                    var rec = getCookie('reclist').replace("#" + recid + "#,", "");
                    document.cookie = "reclist=" + rec + ";expires=" + date.toGMTString();
                    reccount = parseInt(getCookie('reccount')) - 1;

                    if (reccount > 0) {
                        document.cookie = "reccount=" + reccount + ";expires=" + date.toGMTString();
                        $("#cartcount").text(reccount);
                        $('#result_dtlist').find('.datadisp').each(function () {
                            if ($(this).find('.chkItem').val() == recid) {
                                $(this).remove();
                            }
                        });
                    } else {
                        document.cookie = "reccount=;expires=Thu, 01 Jan 1970 00:00:01 GMT;";
                        document.cookie = "reclist=;expires=Thu, 01 Jan 1970 00:00:01 GMT;";
                        alert("No data in cart.");
                        window.location = "default.aspx";
                    }
                }
            });

            $('#result_dtlist').on("click", ".favourite", function () {
                var rec = $(this).find(".recf").text();
                if ($('#membersession').text() == '') {
                    alert("Log In First.");
                    window.location = 'LoginForm.aspx';
                } else {
                    if ($(this).find('.glyphicon').hasClass('glyphicon-heart')) {

                        $.ajax({
                            async: false,
                            type: "POST",
                            url: "favouritedata.asmx/DeleteFavourite",
                            datatype: "json",
                            data: "{RecID:'" + rec + "',m_member:'" + $('#membersession').text() + "'}",
                            contentType: "application/json; charset=utf-8",
                            success: function (msg) {
                            },
                        });
                        favourite();

                        if (url_string.indexOf("Favourite.aspx") == -1) {
                            $(this).find('.glyphicon').removeClass('glyphicon-heart');
                            $(this).find('.glyphicon').addClass('glyphicon-heart-empty');
                            $(this).find('.glyphicon').css('color', '');
                        } else {
                            //alert(listString)

                            if (totalrows != "") {
                                $('#result_dtlist').find('.datadisp').each(function () {
                                    if ($(this).find('.chkItem').val() == rec) {
                                        $(this).remove();
                                    }
                                });
                            } else {
                                alert("No data in favourite.");
                                window.location = "default.aspx";
                            }
                        }
                    } else {
                        var status = 0;
                        $.ajax({
                            async: false,
                            type: "POST",
                            url: "favouritedata.asmx/AddToFavourite",
                            datatype: "json",
                            data: "{RecID:'" + rec + "',m_member:'" + $('#membersession').text() + "'}",
                            contentType: "application/json; charset=utf-8",
                            success: function (msg) {
                                status = msg.d
                            },
                        });
                        favourite()
                        if (status == 1) {
                            $(this).find('.glyphicon').removeClass('glyphicon-heart-empty');
                            $(this).find('.glyphicon').addClass('glyphicon-heart');
                            $(this).find('.glyphicon').css('color', 'red');
                        }
                    }
                }
            });

            $("#facetbtn").on('click', ".btnclear", function () {
                var id = $(this).attr('class').split(" ").pop()
                //   $(".page_style").show();
                sessionStorage.setItem('pageno', "1");
                pageno = parseInt(sessionStorage.getItem('pageno'));
                $(this).parent().find("." + id).remove();
                $('#result_dtlist').empty();
                filter();
                // disp();
                //  window.location.reload()
            });

            $(".last").click(function () {
                $(".page").each(function () {
                    if ($(this).hasClass("active")) {
                        currentPage = parseInt($(this).text());
                    }
                });
                sessionStorage.setItem('pageno', noOfPage);
                $("#lbl_mincnt").text((noOfPage * pageSize) - pageSize + 1);
                $("#lbl_maxcnt").text(totalrows);
                $(".prev").removeClass(String(currentPage - 1));
                $(".next").removeClass(String(currentPage + 1));
                $(".next").addClass(String(noOfPage + 1));
                $(".prev").addClass(String(noOfPage - 1));
                $(".last").hide();
                $(".next").hide();
                $(".ldot").hide();
                $(".prev").show();
                $(".fdot").show();
                $(".first").show();

                $(".page").hide();
                $(".active").removeClass("active");
                $(".page").each(function () {
                    if ($(this).text() == String(noOfPage)) {
                        $(this).prop("class", "page active");
                    }
                });
                for (var n = String(noOfPage) - 2; n <= String(noOfPage); n++) {
                    $(".page:nth-child(" + n + ")").show();
                }
                $('#result_dtlist').empty();
                if (flag == true) {
                    //for (var k = (noOfPage * pageSize) - (pageSize - 1) - 1; k <= (noOfPage * pageSize) - 1; k++) {
                    //    if (typeof ls[k] !== 'undefined') {
                    //        appendData(ls[k], urldata());
                    //    }
                    //}

                    appendDatals((noOfPage * pageSize) - (pageSize - 1) - 1, totalrows - 1);

                } else {
                    //for (var k = (noOfPage * pageSize) - (pageSize - 1) - 1; k <= (noOfPage * pageSize) - 1; k++) {
                    //    if (k < totalrows) {
                    //        appendData(k, urldata());
                    //    }
                    //}
                    appendData((noOfPage * pageSize) - (pageSize - 1) - 1, totalrows - 1);

                }
                displayevent();
                $('#SearchParameters').removeClass("collapse show");
            });

            $(".first").click(function () {
                $(".page").each(function () {
                    if ($(this).hasClass("active")) {
                        currentPage = parseInt($(this).text());
                    }
                });
                sessionStorage.setItem('pageno', "1");
                $("#lbl_mincnt").text("1");
                $("#lbl_maxcnt").text(pageSize);

                $(".prev").removeClass(String(currentPage - 1));
                $(".next").removeClass(String(currentPage + 1));
                $(".next").addClass("2");
                $(".prev").addClass("0");
                $(".first").hide();
                $(".prev").hide();
                $(".fdot").hide();
                $(".last").show();
                $(".next").show();
                $(".ldot").show();

                $(".page").hide();
                $(".active").removeClass("active");
                $(".page").each(function () {
                    if ($(this).text() == "1") {
                        $(this).prop("class", "page page-item active");
                    }
                });
                for (var n = 1; n <= 3; n++) {
                    $(".page:nth-child(" + n + ")").show();
                }
                $('#result_dtlist').empty();
                if (flag == true) {
                    //for (var k = (1 * pageSize) - (pageSize - 1) - 1; k <= (1 * pageSize) - 1; k++) {
                    //    if (typeof ls[k] !== 'undefined') {
                    //        appendData(ls[k], urldata());
                    //    }
                    //}
                    appendDatals((1 * pageSize) - (pageSize - 1) - 1, (1 * pageSize) - 1);

                } else {
                    //for (var k = (1 * pageSize) - (pageSize - 1) - 1; k <= (1 * pageSize) - 1; k++) {
                    //    if (k < totalrows) {
                    //        appendData(k, urldata());
                    //    }
                    //}
                    appendData((1 * pageSize) - (pageSize - 1) - 1, (1 * pageSize) - 1);

                }
                displayevent();
                $('#SearchParameters').removeClass("collapse show");
            });

            $(".next").click(function () {
                currentPage = parseInt(this.className.split(" ")[2], 10);

                sessionStorage.setItem('pageno', currentPage);
                $("#lbl_mincnt").text((currentPage * pageSize) - pageSize + 1);
                if (totalrows > currentPage * pageSize) {
                    $("#lbl_maxcnt").text(currentPage * pageSize);
                } else {
                    $("#lbl_maxcnt").text(totalrows);
                }
                $(".prev").removeClass(String(currentPage - 2));
                $(".next").removeClass(String(currentPage));
                $(".prev").addClass(String(currentPage - 1));
                $(".next").addClass(String(currentPage + 1));
                $(".page").hide();
                $(".active").removeClass("active");
                $(".page").each(function () {
                    if ($(this).text() == String(currentPage)) {
                        $(this).prop("class", "page page-item active");
                    }
                });
                CurrentPage(currentPage);
                $('#result_dtlist').empty();
                if (flag == true) {
                    //for (var k = (currentPage * pageSize) - (pageSize - 1) - 1; k <= (currentPage * pageSize) - 1; k++) {
                    //    if (typeof ls[k] !== 'undefined') {
                    //        appendData(ls[k], urldata());
                    //    }
                    //}
                    appendDatals((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);
                } else {


                    //for (var k = (currentPage * pageSize) - (pageSize - 1) - 1; k <= (currentPage * pageSize) - 1; k++) {
                    //    if (k < totalrows) {
                    //        appendData(k, urldata());
                    //    }
                    //}
                    appendData((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);

                }
                displayevent();
                $('#SearchParameters').removeClass("collapse show");
            });

            $(".prev").click(function () {
                currentPage = parseInt(this.className.split(" ")[2], 10);

                sessionStorage.setItem('pageno', currentPage);
                $("#lbl_mincnt").text((currentPage * pageSize) - pageSize + 1);
                $("#lbl_maxcnt").text((currentPage * pageSize));

                $(".prev").removeClass(String(currentPage));
                $(".next").removeClass(String(currentPage + 2));
                $(".prev").addClass(String(currentPage - 1));
                $(".next").addClass(String(currentPage + 1));
                $(".page").hide();
                $(".active").removeClass("active");
                $(".page").each(function () {
                    if ($(this).text() == String(currentPage)) {
                        $(this).prop("class", "page page-item active");
                    }
                });
                CurrentPage(currentPage);
                $('#result_dtlist').empty();
                if (flag == true) {
                    //for (var k = (currentPage * pageSize) - (pageSize - 1) - 1; k <= (currentPage * pageSize) - 1; k++) {
                    //    if (typeof ls[k] !== 'undefined') {
                    //        appendData(ls[k], urldata());
                    //    }
                    //}
                    appendDatals((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);

                } else {
                    //for (var k = (currentPage * pageSize) - (pageSize - 1) - 1; k <= (currentPage * pageSize) - 1; k++) {
                    //    if (k < totalrows) {
                    //        appendData(k, urldata());
                    //    }
                    //}
                    appendData((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);

                }
                displayevent();
                $('#SearchParameters').removeClass("collapse show");
            });

            $(".page").click(function () {
                currentPage = parseInt($(this).text());

                sessionStorage.setItem('pageno', currentPage);
                $("#lbl_mincnt").text((currentPage * pageSize) - pageSize + 1);
                if (totalrows > currentPage * pageSize) {
                    $("#lbl_maxcnt").text(currentPage * pageSize);
                } else {
                    $("#lbl_maxcnt").text(totalrows);
                }
                $(".prev").removeClass($(".prev").attr('class').split(" ")[2]);
                $(".next").removeClass($(".next").attr('class').split(" ")[2]);
                $(".prev").addClass(String(currentPage - 1));
                $(".next").addClass(String(currentPage + 1));
                $(".page").hide();
                $(".active").removeClass("active");

                $(".page").each(function () {
                    if ($(this).text() == String(currentPage)) {
                        $(this).prop("class", "page page-item active");
                    }
                });
                CurrentPage(currentPage);
                $('#result_dtlist').empty();
                if (flag == true) {
                    //for (var k = (currentPage * pageSize) - (pageSize - 1) - 1; k <= (currentPage * pageSize) - 1; k++) {
                    //    if (typeof ls[k] !== 'undefined') {
                    //        appendData(ls[k], urldata());
                    //    }
                    appendDatals((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);

                    //}
                } else {

                    //for (var k = (currentPage * pageSize) - (pageSize - 1) - 1; k <= (currentPage * pageSize) - 1; k++) {
                    //    if (k < totalrows) {
                    //        appendData(k, urldata());
                    //    }
                    //}
                    appendData((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);

                }
                displayevent();
                $('#SearchParameters').removeClass("collapse show");
            });

            function pg(b) {
                currentPage = parseInt($(b).text());
                sessionStorage.setItem('pageno', currentPage);
                $("#lbl_mincnt").text((currentPage * pageSize) - pageSize + 1);
                if (totalrows > currentPage * pageSize) {
                    $("#lbl_maxcnt").text(currentPage * pageSize);
                } else {
                    $("#lbl_maxcnt").text(totalrows);
                }
                $(".prev").removeClass($(".prev").attr('class').split(" ")[2]);
                $(".next").removeClass($(".next").attr('class').split(" ")[2]);
                $(".prev").addClass(String(currentPage - 1));
                $(".next").addClass(String(currentPage + 1));
                $(".page").hide();
                $(".active").removeClass("active");

                $(".page").each(function () {
                    if ($(this).text() == String(currentPage)) {
                        $(this).prop("class", "page page-item active");
                    }
                });
                CurrentPage(currentPage);
                $('#result_dtlist').empty();
                if (flag == true) {
                    appendDatals((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);
                } else {
                    appendData((currentPage * pageSize) - (pageSize - 1) - 1, (currentPage * pageSize) - 1);
                }
                displayevent();
                $('#SearchParameters').removeClass("collapse show");
            }

            $(".chkHeader").click(function () {
                if (this.checked) {
                    $(".chkItem").prop('checked', true);
                    $('#result_dtlist').find(".chkItem").value = true;
                    $('#result_dtlist').find(".chkItem").each(function () {
                        var chkvalue = this.value;
                        b.map(function (a) {
                            if (a.RecID == chkvalue) {
                                a.Select = true
                            }
                        })
                    });
                } else {
                    $(".chkItem").prop('checked', false);
                    $('#result_dtlist').find(".chkItem").value = false;
                    $('#result_dtlist').find(".chkItem").each(function () {
                        var chkvalue = this.value;
                        b.map(function (a) {
                            if (a.RecID == chkvalue) {
                                a.Select = false
                            }
                        })
                    });
                }
                $('#SearchParameters').removeClass("collapse show");
            });

            $('#result_dtlist').on("click", ".chkItem", function () {
                var chkvalue = this.value;
                b.map(function (a) {
                    if (a.RecID == chkvalue) {
                        if (a.Select == true) {
                            a.Select = false
                        } else if (a.Select == false) {
                            a.Select = true
                        }
                    }
                })

                if (this.checked == false) {
                    $(".chkHeader").prop('checked', false)
                }
                $('#SearchParameters').removeClass("collapse show");
            });

            $("#btnPrint").click(function () {
                count = 0;
                var datap = printData();

                if (count == 0) {
                    alert("Select atleast 1 record for print.");
                }
                else {
                    var mywindow = window.open('', 'PRINT');
                    mywindow.document.write('<html><body><table style = "border-collapse:collapse;" width = "100%">');
                    mywindow.document.write(datap);
                    mywindow.document.write('</table></body></html>');
                    mywindow.document.close(); // necessary for IE >= 10
                    mywindow.focus(); // necessary for IE >= 10*/
                    mywindow.print();
                    mywindow.close();
                }
                $('#SearchParameters').removeClass("collapse show");
            });

            $('#read_pub, #read_subj, #read_auth, #read_yop, #read_tom ').click(function () {
                var id = $(this).attr('id').split("_")[1];
                if (id == 'pub') {
                    if ($("#read_pub").text().indexOf("Less") != -1) {
                        $("#pub").find("tr").slice(5, 25).hide();
                        $("#read_pub").text("More Publisher(s)");
                    }
                    else if ($("#read_pub").text().indexOf("More") != -1) {

                        $("#pub").find("tr").show();
                        $("#subj").find("tr").slice(5, 25).hide();
                        $("#auth").find("tr").slice(5, 25).hide();
                        $("#tom").find("tr").slice(5, 25).hide();
                        $("#yop").find("tr").slice(5, 25).hide();
                        $("#read_pub").text("Less Publisher(s)");
                    }
                }
                else if (id == 'subj') {
                    if ($("#read_subj").text().indexOf("Less") != -1) {
                        $("#subj").find("tr").slice(5, 25).hide();
                        $("#read_subj").text("More Subject(s)");
                    }
                    else if ($("#read_subj").text().indexOf("More") != -1) {
                        $("#subj").find("tr").show();
                        $("#pub").find("tr").slice(5, 25).hide();
                        $("#auth").find("tr").slice(5, 25).hide();
                        $("#tom").find("tr").slice(5, 25).hide();
                        $("#yop").find("tr").slice(5, 25).hide();
                        $("#read_subj").text("Less Subject(s)");
                    }
                }
                else if (id == 'auth') {
                    if ($("#read_auth").text().indexOf("Less") != -1) {
                        $("#auth").find("tr").slice(5, 25).hide();
                        $("#read_auth").text("More Author(s)");
                    }
                    else if ($("#read_auth").text().indexOf("More") != -1) {
                        $("#auth").find("tr").show();
                        $("#subj").find("tr").slice(5, 25).hide();
                        $("#pub").find("tr").slice(5, 25).hide();
                        $("#tom").find("tr").slice(5, 25).hide();
                        $("#yop").find("tr").slice(5, 25).hide();
                        $("#read_auth").text("Less Author(s)");
                    }
                }
                else if (id == 'tom') {
                    if ($("#read_tom").text().indexOf("Less") != -1) {
                        $("#tom").find("tr").slice(5, 25).hide();
                        $("#read_tom").text("More Material(s)");
                    }
                    else if ($("#read_tom").text().indexOf("More") != -1) {
                        $("#tom").find("tr").show();
                        $("#subj").find("tr").slice(5, 25).hide();
                        $("#pub").find("tr").slice(5, 25).hide();
                        $("#yop").find("tr").slice(5, 25).hide();
                        $("#auth").find("tr").slice(5, 25).hide();
                        $("#read_tom").text("Less Material(s)");
                    }
                } else if (id == 'yop') {
                    if ($("#read_yop").text().indexOf("Less") != -1) {
                        $("#yop").find("tr").slice(5, 25).hide();
                        $("#read_yop").text("More Year(s)");
                    }
                    else if ($("#read_yop").text().indexOf("More") != -1) {
                        $("#yop").find("tr").show();
                        $("#subj").find("tr").slice(5, 25).hide();
                        $("#pub").find("tr").slice(5, 25).hide();
                        $("#auth").find("tr").slice(5, 25).hide();
                        $("#tom").find("tr").slice(5, 25).hide();
                        $("#read_yop").text("Less Year(s)");
                    }
                }
            });

            if (url.searchParams.get("publisher") != null) {
                $('#pub').find('tr').each(function () {
                    if ($(this).find("td:first-child").text().indexOf(url.searchParams.get("publisher")) != -1) {
                        $(this).click();
                    }
                });
            }

            if (url.searchParams.get("subject") != null) {
                $('#subj').find('tr').each(function () {
                    if ($(this).find("td:first-child").text().indexOf(url.searchParams.get("subject")) != -1) {
                        $(this).click();
                    }
                });
            }

            if (url.searchParams.get("author") != null) {
                $('#auth').find('tr').each(function () {
                    if ($(this).find("td:first-child").text().indexOf(url.searchParams.get("author")) != -1) {
                        $(this).click();
                    }
                });
            }

            if (url.searchParams.get("yop") != null) {
                $('#yop').find('tr').each(function () {
                    if ($(this).find("td:first-child").text().indexOf(url.searchParams.get("yop")) != -1) {
                        $(this).click();
                    }
                });
            }

            if (url.searchParams.get("tom") != null) {
                $('#tom').find('tr').each(function () {
                    if ($(this).find("td:first-child").text().indexOf(url.searchParams.get("tom")) != -1) {
                        $(this).click();
                    }
                });
            }


            $("#ContentPlaceHolder1_ddl_Sortby").change(function () {

                var sortedby = $("#ContentPlaceHolder1_ddl_Sortby").val();
                // alert("call " + sortedby);
                datat = b;

                if (sortedby != "Select") {
                    if (sortedby == "Title") {
                        datat = datat.sort(function (a, b) {
                            //a.sortedby.localeCompare(b.sortedby);
                            //"a." + sortedby + ".localeCompare(b." + sortedby + ")";
                            return a.Title.localeCompare(b.Title);
                        });
                    }
                    if (sortedby == "Author") {
                        datat = datat.sort(function (a, b) {
                            //a.sortedby.localeCompare(b.sortedby);
                            //"a." + sortedby + ".localeCompare(b." + sortedby + ")";
                            return a.Author.localeCompare(b.Author);
                        });
                    }
                    if (sortedby == "Subject") {
                        datat = datat.sort(function (a, b) {
                            //a.sortedby.localeCompare(b.sortedby);
                            //"a." + sortedby + ".localeCompare(b." + sortedby + ")";
                            return a.Subject.localeCompare(b.Subject);
                        });
                    }
                    if (sortedby == "Publisher") {
                        datat = datat.sort(function (a, b) {
                            //a.sortedby.localeCompare(b.sortedby);
                            //"a." + sortedby + ".localeCompare(b." + sortedby + ")";
                            return a.Publisher.localeCompare(b.Publisher);
                        });
                    }
                    if (sortedby == "Callno") {
                        datat = datat.sort(function (a, b) {
                            //a.sortedby.localeCompare(b.sortedby);
                            //"a." + sortedby + ".localeCompare(b." + sortedby + ")";
                            return a.Callno.localeCompare(b.Callno);
                        });
                    }


                    for (var i = 0; i < datat.length; i++) {
                        ls.push(datat[i]['SrNo']);
                    }
                    totalrows = datat.length;
                    //console.log("datat[0]['Title'] : " + datat[0]['Title']);

                    $('#result_dtlist').empty();
                    filter();

                }

            });

        });
    } else {
        alert("Data Not Found");
        window.location = 'default.aspx';
    }

   

    
});

function urldataofbook(recid) {
  
    var listString;
    $.ajax({
        async: false,
        type: "POST",
        url: "favouritedata.asmx/bookurldata",
        datatype: "json",
        data: "{'recid':'" + recid + "'}",
        contentType: "application/json; charset=utf-8",
        success: function (msg) {
            listString = msg.d
            if (listString=="N") {
                alert("No link available.");
            } else {
                window.open(listString);
            }
           
        },
    });
   
}

function getCookiedata(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function img(id) {
    $("#img" + id).attr('src','book.gif');
}

