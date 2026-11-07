


    function GetCollege() {
       
        var urlgetcode = '../OPACPanel/GetCollege';
        $.ajax({
            type: "POST",
            url: urlgetcode,
            //data: '{usrid:"' + usrid + '"}',
            data: '',
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            async: false,
            cache: false,
            success: function (msg) {
                var obj = JSON.stringify(msg);
                var str = $.parseJSON(obj);
                $('#txtcolg').append("<option value='0'>--Select College----</option>");
                var j = 0;
                if (str.length > 0) {
                    for (var i = 0; i < str.length; i++) {
                        j = j + 1;
                        //$('#emp').append("<option value='" + str[i]["EmpID"] + "'>" + ["Emp-id&nbsp;&nbsp;&nbsp;"] + str[i]["EmpID"] + ["&nbsp;&nbsp;&nbsp;"] + str[i]["EmpName"] + ["&nbsp;&nbsp;&nbsp;"] + str[i]["Department"] + ["&nbsp;&nbsp;&nbsp;"] + str[i]["Designation"] + "</option>");
                        $('#txtcolg').append("<option value='" + str[i]["colg_cd"] + "'>" + str[i]["colg_name"] + "</option>");

                    }
                    //$('#txtcolg').css('font-size', '14px');
                }
            },
            error: function (request) {
                alert(request.responseText);
            }
        });
        $("#txtcolg").focus();
    }


    

    function getsearchfilterValue() {
        var category = $("input[type='radio']:checked").val();
        $('#booksfoundtbl').DataTable().destroy();
        $("#booksfoundtbody").empty();
        $('#booksfoundtbl').DataTable({
            dom: 'Bfrtip',
            buttons: [
                'pageLength', 'excel'

            ]
        });
    //    
        if (category == 'ALL') {
            //$(".modal").show();
            //alert(category);
            search();


        }

        if (category == 'Publisher') {
            //alert(category);
            searchbookbypublisher();

        }
        if (category == 'ISBN') {
            // alert(category);
            searchbookbyISBN();
        }
        if (category == 'Series') {
            //alert(category);
            searchbookbySeries();
        }
        if (category == 'Accession_No') {
            // alert(category);
            searchbookbyAccessionNo();
        }
        if (category == 'Author') {
            // alert(category);
            searchbookbyAuthor();
        }
        if (category == 'Subject') {
            //  alert(category);
            searchbookbySubject();
        }
        if (category == 'Title') {
            // alert(category);
            searchbookbytitle();

        }
        if (category == 'Topic') {
            // alert(category);
            searchbookbyTopic();

        }
        if (category == 'Call_No') {
            // alert(category);
            searchbookbycallno();
        }
    }


    

    function searchbookbytitle() {
      
        

        var flg = chkcolgselected_ornot();
        if (flg == '0' || flg == null || flg == '' || flg == 'undefined') {
            return;
        }

        else {
            $('#booksfoundtbl').DataTable().destroy();
           
           

            var colg = $("#txtcolg").val();
            var searchvalue = $("#txtsearch").val().trim();

            //   $("input[type='radio'][value='ALL']").prop('checked', true);

            var urlgetcode = '../OPACPanel/searchbookbytitle';
            $.ajax({
                type: "POST",
                url: urlgetcode,
                //data: '',
                data: '{searchvalue:"' + searchvalue + '", colg:"' + colg + '"}',
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                async: false,
                cache: false,
                beforeSend: function () {
                    //$(".modal").show();
                    $("#loader").show();
                },
                complete: function () {
                  //  $(".modal").hide();
                    $("#loader").hide();
                },
                success: function (msg) {
                    var obj = JSON.stringify(msg);
                    var str = $.parseJSON(obj);
                    // var j = 0;
                    var j = $('#booksfoundtbody tr').length;
                    // alert(j);
                    if (str.length > 0) {
                        for (var i = 0; i < str.length; i++) {
                            j = j + 1;
                            var titletxt = 'TITLE';

                            $('#booksfoundtbody').append('<tr class="trr"><td>' + j + '</td><td  id="attribute_' + j + '">' + titletxt + '</td><td id="desc_' + j + '"  onclick="getbookdtl_bycallno(this.id)"><a href="#"  data-bs-toggle="modal" data-bs-target="#bookdtl_callnoModal">' + str[i]["title"] + '</a></td><td id="author_' + j + '">' + str[i]["author_name"] + '</td></tr>')

                        }
                        $('#booksfoundtbl').DataTable({
                            dom: 'Bfrtip',
                            buttons: [
                                'pageLength', 'excel'

                            ]
                        });

                    }
                },
                error: function (request) {
                    alert(request.responseText);
                }
            });
            //}).done(function () {
            //    debugger;
             
            //   // setTimeout(function(){
            //   // $(".section").fadeOut(0);
            //   // $('#spinner').hide();
            //   // },500);
            //});
        }

    }
